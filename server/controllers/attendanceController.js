const mongoose = require('mongoose');
const { Attendance, AuditLog, Class, User, Subject } = require('../models');
const { sendAttendanceAlert } = require('../services/emailService');
const { sendAttendanceSMS } = require('../services/smsService');
const { QRSession } = require('../models');

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
        return res.status(400).json({ 
          error: 'Attendance already marked for this student, subject, date, and period',
          existingAttendance
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
              sendAttendanceAlert(student, subject, classObj?.className || 'N/A', attendanceDate, data.status);
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

      if (studentId) query.student = studentId;
      if (subjectId) query.subject = subjectId;
      if (classId) query.class = classId;
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
          belowThreshold: parseFloat(attendancePercentage) < 75
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
          belowThreshold: parseFloat(overallPercentage) < 75
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

