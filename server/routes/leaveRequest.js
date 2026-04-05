const express = require('express');
const router = express.Router();
const { LeaveRequest, User, Timetable } = require('../models');
const { auth, roleCheck } = require('../middleware/auth');
const { sendLeaveStatusUpdate } = require('../services/emailService');
const { sendLeaveStatusSMS } = require('../services/smsService');
const { evaluateAutomaticEmailPolicy } = require('../services/emailPolicyService');
const { logEmailEvent } = require('../services/emailEventService');

function normalizeDateOnly(dateInput) {
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate());
}

function dayNameFromDate(dateObj) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];
}

router.get('/available-subjects', auth, roleCheck('student'), async (req, res) => {
  try {
    const normalizedDate = normalizeDateOnly(req.query.date);
    if (!normalizedDate) {
      return res.status(400).json({ error: 'Valid date is required' });
    }

    if (!req.user.assignedClass) {
      return res.json({
        date: normalizedDate,
        day: dayNameFromDate(normalizedDate),
        periods: [],
        subjects: [],
        hasClasses: false
      });
    }

    const day = dayNameFromDate(normalizedDate);
    const timetables = await Timetable.find({
      class: req.user.assignedClass,
      day
    })
      .populate('subject', 'subjectName subjectCode')
      .sort({ period: 1 });

    const periods = Array.from(new Set(timetables.map((t) => Number(t.period)).filter((p) => Number.isFinite(p)))).sort((a, b) => a - b);

    const subjectMap = new Map();
    timetables.forEach((entry) => {
      if (!entry.subject) return;
      const key = String(entry.subject._id);
      if (!subjectMap.has(key)) {
        subjectMap.set(key, {
          _id: entry.subject._id,
          subjectName: entry.subject.subjectName,
          subjectCode: entry.subject.subjectCode,
          periods: []
        });
      }

      const subject = subjectMap.get(key);
      if (!subject.periods.includes(entry.period)) {
        subject.periods.push(entry.period);
      }
    });

    const subjects = Array.from(subjectMap.values()).map((s) => ({
      ...s,
      periods: s.periods.sort((a, b) => a - b)
    }));

    return res.json({
      date: normalizedDate,
      day,
      periods,
      subjects,
      hasClasses: subjects.length > 0
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, roleCheck('student'), async (req, res) => {
  try {
    const { subjectId, classId, date, period, reason } = req.body;

    const normalizedDate = normalizeDateOnly(date);
    if (!normalizedDate) {
      return res.status(400).json({ error: 'Valid date is required' });
    }

    const classRef = req.user.assignedClass || classId;
    if (!classRef) {
      return res.status(400).json({ error: 'You are not assigned to any class' });
    }

    if (!subjectId) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const parsedPeriod = period ? Number(period) : null;
    if (parsedPeriod && (!Number.isFinite(parsedPeriod) || parsedPeriod < 1 || parsedPeriod > 10)) {
      return res.status(400).json({ error: 'Invalid period' });
    }

    const day = dayNameFromDate(normalizedDate);
    const timetableQuery = {
      class: classRef,
      day
    };

    if (parsedPeriod) {
      timetableQuery.period = parsedPeriod;
    }

    const scheduledEntries = await Timetable.find(timetableQuery).select('subject period faculty');

    if (!scheduledEntries.length) {
      return res.status(400).json({ error: 'No classes scheduled for selected date/period' });
    }

    const subjectFacultyMap = new Map();
    scheduledEntries.forEach((entry) => {
      const subjectKey = String(entry.subject);
      const facultyKey = String(entry.faculty);
      if (!subjectFacultyMap.has(subjectKey)) {
        subjectFacultyMap.set(subjectKey, new Set());
      }
      subjectFacultyMap.get(subjectKey).add(facultyKey);
    });

    const scheduledSubjectIds = Array.from(subjectFacultyMap.keys());
    const requestAllSubjects = ['all', '__all__'].includes(String(subjectId).toLowerCase());

    let targetSubjectIds = [];
    if (requestAllSubjects) {
      targetSubjectIds = scheduledSubjectIds;
    } else {
      if (!scheduledSubjectIds.includes(String(subjectId))) {
        return res.status(400).json({ error: 'Selected subject is not scheduled for the chosen date' });
      }
      targetSubjectIds = [String(subjectId)];
    }

    const existingRequests = await LeaveRequest.find({
      student: req.user._id,
      class: classRef,
      date: normalizedDate,
      period: parsedPeriod,
      subject: { $in: targetSubjectIds }
    }).select('subject');

    const existingSubjectSet = new Set(existingRequests.map((r) => String(r.subject)));
    const finalSubjectIds = targetSubjectIds.filter((id) => !existingSubjectSet.has(String(id)));

    if (!finalSubjectIds.length) {
      return res.status(409).json({ error: 'Leave request already exists for selected subject(s)' });
    }

    const unresolvedSubjects = finalSubjectIds.filter((id) => {
      const facultySet = subjectFacultyMap.get(String(id));
      return !facultySet || facultySet.size === 0;
    });

    if (unresolvedSubjects.length) {
      return res.status(400).json({ error: 'Faculty assignment not found for one or more selected subjects' });
    }

    if (!parsedPeriod) {
      const ambiguousSubjects = finalSubjectIds.filter((id) => {
        const facultySet = subjectFacultyMap.get(String(id));
        return facultySet && facultySet.size > 1;
      });

      if (ambiguousSubjects.length) {
        return res.status(400).json({
          error: 'Multiple faculty handle selected subject(s). Please choose a specific period.'
        });
      }
    }

    const payload = finalSubjectIds.map((id) => {
      const facultySet = subjectFacultyMap.get(String(id));
      const assignedFaculty = Array.from(facultySet)[0];

      return {
      student: req.user._id,
      subject: id,
      class: classRef,
      assignedFaculty,
      date: normalizedDate,
      period: parsedPeriod,
      reason: String(reason).trim()
      };
    });

    const created = await LeaveRequest.insertMany(payload);

    if (created.length === 1) {
      return res.status(201).json({ message: 'Leave request submitted', leaveRequest: created[0] });
    }

    return res.status(201).json({
      message: `Leave requests submitted for ${created.length} subjects`,
      leaveRequests: created
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'student') {
      query.student = req.user._id;
    } else if (req.user.role === 'faculty') {
      query.assignedFaculty = req.user._id;
    }

    const leaveRequests = await LeaveRequest.find(query)
      .populate('student', 'name email')
      .populate('subject', 'subjectName')
      .populate('class', 'className')
      .populate('assignedFaculty', 'name email')
      .sort({ createdAt: -1 });

    res.json({ leaveRequests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/approve', auth, roleCheck('faculty', 'admin'), async (req, res) => {
  try {
    const leaveRequest = await LeaveRequest.findById(req.params.id);
    if (!leaveRequest) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    if (req.user.role === 'faculty') {
      const assignedMatch = leaveRequest.assignedFaculty && String(leaveRequest.assignedFaculty) === String(req.user._id);
      const legacyClassMatch = !leaveRequest.assignedFaculty
        && req.user.assignedClass
        && String(leaveRequest.class) === String(req.user.assignedClass);

      if (!assignedMatch && !legacyClassMatch) {
        return res.status(403).json({ error: 'Not authorized to review this leave request' });
      }
    }

    leaveRequest.status = 'approved';
    leaveRequest.reviewedBy = req.user._id;
    leaveRequest.reviewedAt = new Date();
    leaveRequest.reviewComment = req.body.comment || '';

    await leaveRequest.save();

    const student = await User.findById(leaveRequest.student);
    const recipientEmail = String(student?.email || '').trim().toLowerCase();
    const policy = await evaluateAutomaticEmailPolicy('leaveApproved');

    if (!policy.allowed) {
      await logEmailEvent({
        triggerKey: 'leaveApproved',
        templateKey: 'leave_status_update',
        recipientEmail,
        status: 'skipped',
        source: 'auto',
        actorUserId: req.user._id,
        errorMessage: policy.reason === 'within-quiet-hours'
          ? 'Skipped due to configured quiet hours'
          : 'Automatic email disabled by admin settings',
        metadata: {
          leaveRequestId: leaveRequest._id,
          studentId: leaveRequest.student,
          decision: 'approved',
          policyReason: policy.reason,
        },
      });
    } else if (!recipientEmail) {
      await logEmailEvent({
        triggerKey: 'leaveApproved',
        templateKey: 'leave_status_update',
        recipientEmail,
        status: 'failed',
        source: 'auto',
        actorUserId: req.user._id,
        errorMessage: 'Student email is missing',
        metadata: {
          leaveRequestId: leaveRequest._id,
          studentId: leaveRequest.student,
          decision: 'approved',
        },
      });
    } else {
      const emailSent = await sendLeaveStatusUpdate(leaveRequest, student);
      await logEmailEvent({
        triggerKey: 'leaveApproved',
        templateKey: 'leave_status_update',
        recipientEmail,
        status: emailSent ? 'success' : 'failed',
        source: 'auto',
        actorUserId: req.user._id,
        errorMessage: emailSent ? '' : 'Email service returned failure',
        metadata: {
          leaveRequestId: leaveRequest._id,
          studentId: leaveRequest.student,
          decision: 'approved',
        },
      });
    }

    await sendLeaveStatusSMS(leaveRequest, student);

    res.json({ message: 'Leave request approved', leaveRequest });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/reject', auth, roleCheck('faculty', 'admin'), async (req, res) => {
  try {
    const leaveRequest = await LeaveRequest.findById(req.params.id);
    if (!leaveRequest) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    if (req.user.role === 'faculty') {
      const assignedMatch = leaveRequest.assignedFaculty && String(leaveRequest.assignedFaculty) === String(req.user._id);
      const legacyClassMatch = !leaveRequest.assignedFaculty
        && req.user.assignedClass
        && String(leaveRequest.class) === String(req.user.assignedClass);

      if (!assignedMatch && !legacyClassMatch) {
        return res.status(403).json({ error: 'Not authorized to review this leave request' });
      }
    }

    leaveRequest.status = 'rejected';
    leaveRequest.reviewedBy = req.user._id;
    leaveRequest.reviewedAt = new Date();
    leaveRequest.reviewComment = req.body.comment || '';

    await leaveRequest.save();

    const student = await User.findById(leaveRequest.student);
    const recipientEmail = String(student?.email || '').trim().toLowerCase();
    const policy = await evaluateAutomaticEmailPolicy('leaveRejected');

    if (!policy.allowed) {
      await logEmailEvent({
        triggerKey: 'leaveRejected',
        templateKey: 'leave_status_update',
        recipientEmail,
        status: 'skipped',
        source: 'auto',
        actorUserId: req.user._id,
        errorMessage: policy.reason === 'within-quiet-hours'
          ? 'Skipped due to configured quiet hours'
          : 'Automatic email disabled by admin settings',
        metadata: {
          leaveRequestId: leaveRequest._id,
          studentId: leaveRequest.student,
          decision: 'rejected',
          policyReason: policy.reason,
        },
      });
    } else if (!recipientEmail) {
      await logEmailEvent({
        triggerKey: 'leaveRejected',
        templateKey: 'leave_status_update',
        recipientEmail,
        status: 'failed',
        source: 'auto',
        actorUserId: req.user._id,
        errorMessage: 'Student email is missing',
        metadata: {
          leaveRequestId: leaveRequest._id,
          studentId: leaveRequest.student,
          decision: 'rejected',
        },
      });
    } else {
      const emailSent = await sendLeaveStatusUpdate(leaveRequest, student);
      await logEmailEvent({
        triggerKey: 'leaveRejected',
        templateKey: 'leave_status_update',
        recipientEmail,
        status: emailSent ? 'success' : 'failed',
        source: 'auto',
        actorUserId: req.user._id,
        errorMessage: emailSent ? '' : 'Email service returned failure',
        metadata: {
          leaveRequestId: leaveRequest._id,
          studentId: leaveRequest.student,
          decision: 'rejected',
        },
      });
    }

    await sendLeaveStatusSMS(leaveRequest, student);

    res.json({ message: 'Leave request rejected', leaveRequest });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
