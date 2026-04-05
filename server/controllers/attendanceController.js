const mongoose = require('mongoose');
const { Attendance, AuditLog, Class, User, Subject, LowAttendanceEmailLog } = require('../models');
const { sendAttendanceAlert, sendTemplatedEmail } = require('../services/emailService');
const { sendAttendanceSMS } = require('../services/smsService');
const { QRSession } = require('../models');
const { evaluateAutomaticEmailPolicy, getAdminConfigSetting } = require('../services/emailPolicyService');
const { logEmailEvent } = require('../services/emailEventService');

function normalizeToUtcDay(dateValue) {
  const d = new Date(dateValue);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function buildUtcDayRange(dateValue) {
  const start = normalizeToUtcDay(dateValue);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function normalizeCutoffDate(dateValue) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;

  const d = new Date(parsed);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

async function buildLowAttendanceRows({ cutoffDate, threshold }) {
  const requestedThreshold = threshold === undefined || threshold === null || threshold === ''
    ? null
    : Number(threshold);
  const settings = await getAdminConfigSetting();
  const configuredGlobalThreshold = Number(settings.attendanceRules.globalLowAttendanceThreshold || 75);

  const globalThreshold = requestedThreshold !== null && Number.isFinite(requestedThreshold)
    ? requestedThreshold
    : configuredGlobalThreshold;

  const aggregation = await Attendance.aggregate([
    {
      $match: {
        date: { $lte: cutoffDate }
      }
    },
    {
      $group: {
        _id: '$student',
        totalClasses: { $sum: 1 },
        presentClasses: {
          $sum: {
            $cond: [{ $eq: ['$status', 'present'] }, 1, 0]
          }
        }
      }
    },
    {
      $project: {
        student: '$_id',
        totalClasses: 1,
        presentClasses: 1,
        attendancePercentage: {
          $cond: {
            if: { $gt: ['$totalClasses', 0] },
            then: {
              $multiply: [
                { $divide: ['$presentClasses', '$totalClasses'] },
                100
              ]
            },
            else: 0
          }
        }
      }
    },
    {
      $sort: {
        attendancePercentage: 1,
        totalClasses: -1
      }
    }
  ]);

  const studentIds = aggregation.map((a) => a.student);
  const students = await User.find({ _id: { $in: studentIds } })
    .select('name email parentEmail uniqueId assignedClass')
    .populate('assignedClass', 'className lowAttendanceThreshold');

  const studentMap = new Map(students.map((s) => [String(s._id), s]));

  const reportRows = aggregation
    .map((item) => {
      const student = studentMap.get(String(item.student));
      if (!student) return null;

      const recipientEmail = student.parentEmail || student.email || '';
      if (!recipientEmail) return null;

      const classThreshold = Number(student.assignedClass?.lowAttendanceThreshold);
      const thresholdUsed = requestedThreshold !== null && Number.isFinite(requestedThreshold)
        ? requestedThreshold
        : (Number.isFinite(classThreshold) ? classThreshold : globalThreshold);

      const attendancePercentage = Number(item.attendancePercentage.toFixed(2));
      if (attendancePercentage >= thresholdUsed) return null;

      return {
        studentId: item.student,
        studentName: student.name,
        studentEmail: student.email || '',
        parentEmail: student.parentEmail || '',
        recipientEmail,
        uniqueId: student.uniqueId || '',
        className: student.assignedClass?.className || 'Unassigned',
        totalClasses: item.totalClasses,
        presentClasses: item.presentClasses,
        thresholdUsed,
        attendancePercentage
      };
    })
    .filter(Boolean);

  return reportRows;
}

async function enforceFacultyStudentScope(req, studentId) {
  if (req.user.role !== 'faculty') return null;

  if (!req.user.assignedClass) {
    return 'Faculty account has no assigned class.';
  }

  const student = await User.findById(studentId).select('assignedClass');
  if (!student || !student.assignedClass || String(student.assignedClass) !== String(req.user.assignedClass)) {
    return 'You can only access attendance for students in your assigned class.';
  }

  return null;
}

const attendanceController = {
  async markAttendance(req, res) {
    try {
      const { studentId, subjectId, classId, date, period, status } = req.body;

      if (!studentId || !subjectId || !classId || !date || !period || !status) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      const attendanceDate = normalizeToUtcDay(date);

      const existingAttendance = await Attendance.findOne({
        student: studentId,
        subject: subjectId,
        date: attendanceDate,
        period: parseInt(period)
      });

      if (existingAttendance) {
        existingAttendance.status = status;
        existingAttendance.markedBy = req.user._id;
        await existingAttendance.save();

        const updatedAttendance = await Attendance.findById(existingAttendance._id)
          .populate('student', 'name email')
          .populate('subject', 'subjectName subjectCode')
          .populate('class', 'className')
          .populate('markedBy', 'name');

        return res.status(200).json({
          message: 'Attendance updated successfully',
          attendance: updatedAttendance
        });
      }

      const attendance = new Attendance({
        student: studentId,
        subject: subjectId,
        class: classId,
        date: attendanceDate,
        period: parseInt(period),
        status,
        markedBy: req.user._id
      });

      await attendance.save();

      const student = await User.findById(studentId);
      const Subject = require('../models/Subject');
      const subject = await Subject.findById(subjectId);

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'MARK_ATTENDANCE',
        details: `Marked ${status} for student ${student?.name || studentId} in ${subject?.subjectName || subjectId}`,
        entityType: 'ATTENDANCE',
        entityId: attendance._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      const populatedAttendance = await Attendance.findById(attendance._id)
        .populate('student', 'name email')
        .populate('subject', 'subjectName subjectCode')
        .populate('class', 'className')
        .populate('markedBy', 'name');

      res.status(201).json({
        message: 'Attendance marked successfully',
        attendance: populatedAttendance
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ 
          error: 'Attendance already exists for this combination' 
        });
      }
      res.status(500).json({ error: error.message });
    }
  },

  async bulkMarkAttendance(req, res) {
    try {
      const { attendanceData } = req.body;

      if (!attendanceData || !Array.isArray(attendanceData)) {
        return res.status(400).json({ error: 'attendanceData array is required' });
      }

      const results = {
        success: [],
        failed: []
      };

      const attendanceAbsentPolicy = await evaluateAutomaticEmailPolicy('attendanceAbsent');

      for (const data of attendanceData) {
        try {
          const attendanceDate = normalizeToUtcDay(data.date);

          const existingAttendance = await Attendance.findOne({
            student: data.studentId,
            subject: data.subjectId,
            date: attendanceDate,
            period: parseInt(data.period)
          });

          if (existingAttendance) {
            if (existingAttendance.status !== data.status) {
              existingAttendance.status = data.status;
              existingAttendance.markedBy = req.user._id;
              await existingAttendance.save();
            }
            results.success.push(data.studentId);
            continue;
          }

          const attendance = new Attendance({
            student: data.studentId,
            subject: data.subjectId,
            class: data.classId,
            date: attendanceDate,
            period: parseInt(data.period),
            status: data.status,
            markedBy: req.user._id
          });

          await attendance.save();

          if (data.status === 'absent') {
            const student = await User.findById(data.studentId).populate('parentEmail parentPhone');
            const subject = await Subject.findById(data.subjectId);
            const classObj = await Class.findById(data.classId);
            
            if (student) {
              const recipientEmail = String(student.parentEmail || student.email || '').trim().toLowerCase();

              if (!attendanceAbsentPolicy.allowed) {
                await logEmailEvent({
                  triggerKey: 'attendanceAbsent',
                  templateKey: 'attendance_alert',
                  recipientEmail,
                  status: 'skipped',
                  source: 'auto',
                  actorUserId: req.user._id,
                  errorMessage: attendanceAbsentPolicy.reason === 'within-quiet-hours'
                    ? 'Skipped due to configured quiet hours'
                    : 'Automatic email disabled by admin settings',
                  metadata: {
                    studentId: student._id,
                    subjectId: data.subjectId,
                    classId: data.classId,
                    attendanceDate,
                    period: parseInt(data.period),
                    policyReason: attendanceAbsentPolicy.reason,
                  },
                });
              } else if (!recipientEmail) {
                await logEmailEvent({
                  triggerKey: 'attendanceAbsent',
                  templateKey: 'attendance_alert',
                  recipientEmail,
                  status: 'failed',
                  source: 'auto',
                  actorUserId: req.user._id,
                  errorMessage: 'Recipient email is missing',
                  metadata: {
                    studentId: student._id,
                    subjectId: data.subjectId,
                    classId: data.classId,
                    attendanceDate,
                    period: parseInt(data.period),
                  },
                });
              } else {
                const emailSent = await sendAttendanceAlert(
                  student,
                  subject,
                  classObj?.className || 'N/A',
                  attendanceDate,
                  data.status
                );

                await logEmailEvent({
                  triggerKey: 'attendanceAbsent',
                  templateKey: 'attendance_alert',
                  recipientEmail,
                  status: emailSent ? 'success' : 'failed',
                  source: 'auto',
                  actorUserId: req.user._id,
                  errorMessage: emailSent ? '' : 'Email service returned failure',
                  metadata: {
                    studentId: student._id,
                    subjectId: data.subjectId,
                    classId: data.classId,
                    attendanceDate,
                    period: parseInt(data.period),
                  },
                });
              }

              sendAttendanceSMS(student, subject, classObj?.className || 'N/A', attendanceDate, data.status);
            }
          }

          results.success.push(data.studentId);
        } catch (err) {
          results.failed.push({
            studentId: data.studentId,
            reason: err.message
          });
        }
      }

      res.json({
        message: 'Bulk attendance marking completed',
        results
      });

      if (results.success.length > 0) {
        await AuditLog.create({
          userId: req.user._id,
          userName: req.user.name,
          userRole: req.user.role,
          action: 'MARK_ATTENDANCE',
          details: `Bulk marked attendance for ${results.success.length} students`,
          entityType: 'ATTENDANCE',
          ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
          userAgent: req.get('user-agent') || '',
          status: 'SUCCESS'
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getAttendance(req, res) {
    try {
      const { studentId, subjectId, classId, startDate, endDate } = req.query;
      const query = {};

      if (req.user.role === 'faculty') {
        if (!req.user.assignedClass) {
          return res.status(403).json({ error: 'Faculty account has no assigned class.' });
        }

        if (classId && String(classId) !== String(req.user.assignedClass)) {
          return res.status(403).json({ error: 'You can only query attendance for your assigned class.' });
        }

        query.class = req.user.assignedClass;
      }

      if (studentId) query.student = studentId;
      if (subjectId) query.subject = subjectId;
      if (classId && req.user.role !== 'faculty') query.class = classId;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setUTCHours(23, 59, 59, 999);
          query.date.$lte = end;
        }
      }

      const attendances = await Attendance.find(query)
        .populate('student', 'name email')
        .populate('subject', 'subjectName subjectCode')
        .populate('class', 'className section batch year')
        .populate('markedBy', 'name')
        .sort({ date: -1, period: 1 });

      res.json({ attendances });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getStudentAttendance(req, res) {
    try {
      const studentId = req.params.studentId || req.user._id;
      const { subjectId, startDate, endDate } = req.query;

      const scopeError = await enforceFacultyStudentScope(req, studentId);
      if (scopeError) {
        return res.status(403).json({ error: scopeError });
      }

      const query = { student: studentId };
      if (subjectId) query.subject = subjectId;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setUTCHours(23, 59, 59, 999);
          query.date.$lte = end;
        }
      }

      const attendances = await Attendance.find(query)
        .populate('subject', 'subjectName subjectCode')
        .populate('class', 'className')
        .sort({ date: -1, period: 1 });

      res.json({ attendances });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getStudentAttendanceSummary(req, res) {
    try {
      const studentId = req.params.studentId || req.user._id;
      const { startDate, endDate } = req.query;

      const scopeError = await enforceFacultyStudentScope(req, studentId);
      if (scopeError) {
        return res.status(403).json({ error: scopeError });
      }

      const matchQuery = { student: new mongoose.Types.ObjectId(studentId) };
      if (startDate || endDate) {
        matchQuery.date = {};
        if (startDate) matchQuery.date.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setUTCHours(23, 59, 59, 999);
          matchQuery.date.$lte = end;
        }
      }

      const subjects = await Attendance.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$subject',
            totalClasses: { $sum: 1 },
            present: {
              $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
            },
            absent: {
              $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
            }
          }
        }
      ]);

      const subjectDetails = await require('../models/Subject').find({
        _id: { $in: subjects.map(s => s._id) }
      });

      const student = await User.findById(studentId).select('assignedClass');
      const [settings, assignedClass] = await Promise.all([
        getAdminConfigSetting(),
        student?.assignedClass
          ? Class.findById(student.assignedClass).select('lowAttendanceThreshold')
          : Promise.resolve(null),
      ]);

      const classThreshold = Number(assignedClass?.lowAttendanceThreshold);
      const globalThreshold = Number(settings.attendanceRules.globalLowAttendanceThreshold || 75);
      const effectiveThreshold = Number.isFinite(classThreshold) ? classThreshold : globalThreshold;

      const summary = subjects.map(s => {
        const subject = subjectDetails.find(sub => sub._id.toString() === s._id.toString());
        const attendancePercentage = s.totalClasses > 0 
          ? ((s.present / s.totalClasses) * 100).toFixed(2) 
          : 0;

        return {
          subjectId: s._id,
          subjectName: subject?.subjectName || 'Unknown',
          subjectCode: subject?.subjectCode || 'N/A',
          totalClasses: s.totalClasses,
          present: s.present,
          absent: s.absent,
          attendancePercentage: parseFloat(attendancePercentage),
          thresholdUsed: effectiveThreshold,
          belowThreshold: parseFloat(attendancePercentage) < effectiveThreshold
        };
      });

      const totalClasses = summary.reduce((sum, s) => sum + s.totalClasses, 0);
      const totalPresent = summary.reduce((sum, s) => sum + s.present, 0);
      const overallPercentage = totalClasses > 0 
        ? ((totalPresent / totalClasses) * 100).toFixed(2) 
        : 0;

      res.json({
        summary,
        overall: {
          totalClasses,
          totalPresent,
          attendancePercentage: parseFloat(overallPercentage),
          thresholdUsed: effectiveThreshold,
          belowThreshold: parseFloat(overallPercentage) < effectiveThreshold
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async updateAttendance(req, res) {
    try {
      const { id } = req.params;
      const { status, modificationReason } = req.body;

      if (!status || !['present', 'absent', 'late'].includes(status)) {
        return res.status(400).json({ error: 'Valid status is required (present/absent/late)' });
      }

      const attendance = await Attendance.findById(id).populate('student', 'name');
      if (!attendance) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }
      
      const originalStatus = attendance.status;

      // If the status is actually changing, a reason is mandatory
      if (originalStatus !== status && !modificationReason) {
        return res.status(400).json({ error: 'A reason is required for modifying attendance.' });
      }

      const attendanceDate = new Date(attendance.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      attendanceDate.setHours(0, 0, 0, 0);

      const diffDays = (today - attendanceDate) / (1000 * 60 * 60 * 24);

      if (diffDays > 7 && req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Cannot edit attendance older than 7 days (except for admins).' 
        });
      }

      attendance.status = status;
      
      // If the status was changed, log the modification details
      if (originalStatus !== status) {
        attendance.isModified = true;
        attendance.modifiedBy = req.user._id;
        attendance.modificationReason = modificationReason;
        // Only set originalStatus the first time it's modified
        if (!attendance.originalStatus) {
          attendance.originalStatus = originalStatus;
        }
      }
      
      await attendance.save();

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE_ATTENDANCE',
        details: `Updated attendance for ${attendance.student.name} from ${originalStatus} to ${status}. Reason: ${modificationReason || 'Not provided'}`,
        entityType: 'ATTENDANCE',
        entityId: attendance._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      const updatedAttendance = await Attendance.findById(id)
        .populate('student', 'name email')
        .populate('subject', 'subjectName subjectCode')
        .populate('class', 'className');

      res.json({
        message: 'Attendance updated successfully',
        attendance: updatedAttendance
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getClassAttendance(req, res) {
    try {
      const { classId, subjectId, date, period } = req.query;

      const query = {};
      if (classId) query.class = classId;
      if (subjectId) query.subject = subjectId;
      if (date) {
        const dayRange = buildUtcDayRange(date);
        query.date = {
          $gte: dayRange.start,
          $lt: dayRange.end
        };
      }
      if (period) query.period = parseInt(period);

      const attendances = await Attendance.find(query)
        .populate('student', 'name email')
        .populate('subject', 'subjectName subjectCode')
        .populate('class', 'className')
        .sort({ 'student.name': 1 });

      res.json({ attendances });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getReport(req, res) {
    try {
      const { classId, subjectId, startDate, endDate } = req.query;
      const query = {};

      if (classId) query.class = classId;
      if (subjectId) query.subject = subjectId;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
      }

      const aggregation = await Attendance.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              student: '$student',
              subject: '$subject'
            },
            totalClasses: { $sum: 1 },
            present: {
              $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
            }
          }
        },
        {
          $project: {
            student: '$_id.student',
            subject: '$_id.subject',
            totalClasses: 1,
            present: 1,
            attendancePercentage: {
              $cond: {
                if: { $gt: ['$totalClasses', 0] },
                then: {
                  $multiply: [
                    { $divide: ['$present', '$totalClasses'] },
                    100
                  ]
                },
                else: 0
              }
            }
          }
        }
      ]);

      const studentIds = [...new Set(aggregation.map(a => a.student.toString()))];
      const subjectIds = [...new Set(aggregation.map(a => a.subject.toString()))];

      const students = await User.find({ _id: { $in: studentIds } });
      const subjects = await require('../models/Subject').find({ _id: { $in: subjectIds } });

      const report = aggregation.map(item => {
        const student = students.find(s => s._id.toString() === item.student.toString());
        const subject = subjects.find(s => s._id.toString() === item.subject.toString());

        return {
          studentId: item.student,
          studentName: student?.name || 'Unknown',
          studentEmail: student?.email || 'N/A',
          subjectId: item.subject,
          subjectName: subject?.subjectName || 'Unknown',
          subjectCode: subject?.subjectCode || 'N/A',
          totalClasses: item.totalClasses,
          present: item.present,
          attendancePercentage: parseFloat(item.attendancePercentage.toFixed(2))
        };
      });

      res.json({ report });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getLowAttendanceReport(req, res) {
    try {
      const { cutoffDate, threshold } = req.query;
      if (!cutoffDate) {
        return res.status(400).json({ error: 'cutoffDate is required' });
      }

      const normalizedCutoffDate = normalizeCutoffDate(cutoffDate);
      if (!normalizedCutoffDate) {
        return res.status(400).json({ error: 'Invalid cutoffDate' });
      }

      const normalizedThreshold = threshold === undefined || threshold === null || threshold === ''
        ? null
        : Number(threshold);

      if (normalizedThreshold !== null && (!Number.isFinite(normalizedThreshold) || normalizedThreshold < 0 || normalizedThreshold > 100)) {
        return res.status(400).json({ error: 'threshold must be between 0 and 100' });
      }

      const rows = await buildLowAttendanceRows({
        cutoffDate: normalizedCutoffDate,
        threshold: normalizedThreshold
      });

      const sentLogs = await LowAttendanceEmailLog.find({
        cutoffDate: normalizedCutoffDate,
        student: { $in: rows.map((r) => r.studentId) },
        sentAt: { $ne: null }
      }).select('student sentAt');

      const sentMap = new Map(sentLogs.map((log) => [String(log.student), log.sentAt]));

      const report = rows.map((row) => ({
        ...row,
        emailSent: sentMap.has(String(row.studentId)),
        sentAt: sentMap.get(String(row.studentId)) || null
      }));

      res.json({
        cutoffDate: normalizedCutoffDate,
        threshold: normalizedThreshold,
        total: report.length,
        sentCount: report.filter((r) => r.emailSent).length,
        report
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async sendLowAttendanceEmails(req, res) {
    try {
      const {
        cutoffDate,
        threshold,
        studentIds = [],
        forceResend = false,
        confirm = false
      } = req.body || {};

      if (!confirm) {
        return res.status(400).json({ error: 'Please confirm before sending emails' });
      }

      if (!cutoffDate) {
        return res.status(400).json({ error: 'cutoffDate is required' });
      }

      const normalizedCutoffDate = normalizeCutoffDate(cutoffDate);
      if (!normalizedCutoffDate) {
        return res.status(400).json({ error: 'Invalid cutoffDate' });
      }

      const normalizedThreshold = threshold === undefined || threshold === null || threshold === ''
        ? null
        : Number(threshold);

      if (normalizedThreshold !== null && (!Number.isFinite(normalizedThreshold) || normalizedThreshold < 0 || normalizedThreshold > 100)) {
        return res.status(400).json({ error: 'threshold must be between 0 and 100' });
      }

      const reportRows = await buildLowAttendanceRows({
        cutoffDate: normalizedCutoffDate,
        threshold: normalizedThreshold
      });

      const selectedSet = new Set((Array.isArray(studentIds) ? studentIds : []).map(String));
      const targetRows = selectedSet.size
        ? reportRows.filter((row) => selectedSet.has(String(row.studentId)))
        : reportRows;

      if (!targetRows.length) {
        return res.json({
          message: 'No students matched the selection',
          sent: [],
          skipped: [],
          failed: []
        });
      }

      const existingLogs = await LowAttendanceEmailLog.find({
        cutoffDate: normalizedCutoffDate,
        student: { $in: targetRows.map((row) => row.studentId) },
        sentAt: { $ne: null }
      }).select('student');

      const alreadySentSet = new Set(existingLogs.map((log) => String(log.student)));

      const sent = [];
      const skipped = [];
      const failed = [];

      for (const row of targetRows) {
        const studentId = String(row.studentId);

        if (!forceResend && alreadySentSet.has(studentId)) {
          skipped.push({ studentId, reason: 'Already sent for selected cutoff date' });
          continue;
        }

        try {
          const triggerKey = 'lowAttendanceAuto';
          await sendTemplatedEmail({
            to: row.recipientEmail,
            templateKey: 'generic_notification',
            subject: 'Low Attendance Alert',
            variables: {
              heading: 'Low Attendance Alert',
              message: `Student ${row.studentName} currently has ${row.attendancePercentage}% attendance up to ${normalizedCutoffDate.toISOString().split('T')[0]}. Please take corrective action.`,
              ctaText: 'View Attendance Portal',
              ctaUrl: process.env.BASE_URL || 'http://localhost:3000/html/login.html'
            }
          });

          await LowAttendanceEmailLog.findOneAndUpdate(
            {
              student: row.studentId,
              cutoffDate: normalizedCutoffDate,
              threshold: row.thresholdUsed
            },
            {
              $set: {
                totalClasses: row.totalClasses,
                presentClasses: row.presentClasses,
                attendancePercentage: row.attendancePercentage,
                recipientEmail: row.recipientEmail,
                sentAt: new Date(),
                sentBy: req.user._id
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          sent.push({ studentId, email: row.recipientEmail });

          await logEmailEvent({
            triggerKey,
            templateKey: 'generic_notification',
            recipientEmail: row.recipientEmail,
            status: 'success',
            source: 'manual',
            actorUserId: req.user._id,
            metadata: {
              studentId,
              cutoffDate: normalizedCutoffDate,
              thresholdUsed: row.thresholdUsed,
            },
          });
        } catch (err) {
          failed.push({ studentId, email: row.recipientEmail, reason: err.message });

          await logEmailEvent({
            triggerKey: 'lowAttendanceAuto',
            templateKey: 'generic_notification',
            recipientEmail: row.recipientEmail,
            status: 'failed',
            source: 'manual',
            actorUserId: req.user._id,
            errorMessage: err.message,
            metadata: {
              studentId,
              cutoffDate: normalizedCutoffDate,
              thresholdUsed: row.thresholdUsed,
            },
          });
        }
      }

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE',
        details: `Low attendance mail run for cutoff ${normalizedCutoffDate.toISOString().split('T')[0]}: sent=${sent.length}, skipped=${skipped.length}, failed=${failed.length}`,
        entityType: 'ATTENDANCE',
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        routePath: req.originalUrl,
        userAgent: req.get('user-agent') || '',
        status: failed.length ? 'FAILED' : 'SUCCESS'
      });

      res.json({
        message: 'Low attendance email processing completed',
        sent,
        skipped,
        failed
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async exportCSV(req, res) {
    try {
      const { classId, subjectId, startDate, endDate } = req.query;
      const query = {};

      if (classId) query.class = classId;
      if (subjectId) query.subject = subjectId;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
      }

      const attendances = await Attendance.find(query)
        .populate('student', 'name email')
        .populate('subject', 'subjectName subjectCode')
        .populate('class', 'className')
        .sort({ date: -1, period: 1 });

      let csv = 'Student Name,Student Email,Class,Subject,Date,Period,Status\n';

      attendances.forEach(a => {
        csv += `"${a.student?.name || 'N/A'}","${a.student?.email || 'N/A'}","${a.class?.className || 'N/A'}","${a.subject?.subjectName || 'N/A'}","${a.date.toISOString().split('T')[0]}","${a.period}","${a.status}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.csv');
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = attendanceController;

