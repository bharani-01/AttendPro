const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { User, Attendance, QRSession, Class, Subject, Timetable } = require('../models');
const { auth, roleCheck } = require('../middleware/auth');
const { sendAttendanceAlert } = require('../services/emailService');
const { sendAttendanceSMS } = require('../services/smsService');

const QR_ROTATION_MS = 10 * 1000;
const PREVIOUS_TOKEN_GRACE_MS = 10 * 1000;

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

function buildQrPayload(sessionId, token) {
  return JSON.stringify({
    sessionId: String(sessionId),
    token
  });
}

function rotateTokenIfNeeded(session, force = false) {
  const now = Date.now();
  const lastUpdate = session.qrTokenUpdatedAt ? new Date(session.qrTokenUpdatedAt).getTime() : 0;

  if (force || !session.currentQrToken || (now - lastUpdate) >= QR_ROTATION_MS) {
    session.previousQrToken = session.currentQrToken || null;
    session.currentQrToken = crypto.randomBytes(16).toString('hex');
    session.qrTokenUpdatedAt = new Date(now);
    session.qrCode = buildQrPayload(session._id, session.currentQrToken);
    return true;
  }

  return false;
}

function isQrTokenValid(session, token) {
  // Keep backward compatibility for existing manual/session-link check-ins.
  if (!token) return true;
  if (token === session.currentQrToken) return true;

  if (token === session.previousQrToken && session.qrTokenUpdatedAt) {
    const age = Date.now() - new Date(session.qrTokenUpdatedAt).getTime();
    return age <= PREVIOUS_TOKEN_GRACE_MS;
  }

  return false;
}

function isStudentAssignedToSessionClass(student, classDoc) {
  if (!student || !classDoc) return false;

  const studentId = String(student._id);
  const directClassMember = Array.isArray(classDoc.students) && classDoc.students.some(
    (id) => String(id) === studentId
  );

  const assignedClassMatch = student.assignedClass && String(student.assignedClass) === String(classDoc._id);

  // Fallback: match by academic grouping when explicit class assignment is absent.
  const batchMatch = classDoc.batch && student.batch && classDoc.batch === student.batch;
  const yearMatch = classDoc.year && student.year && classDoc.year === student.year;
  const deptMatch = classDoc.department && student.department && classDoc.department === student.department;
  const groupedMatch = batchMatch && yearMatch && deptMatch;

  return directClassMember || assignedClassMatch || groupedMatch;
}



router.post('/generate', auth, roleCheck('faculty', 'admin'), async (req, res) => {
  try {
    const { subjectId, classId, date, period, validityMinutes = 10 } = req.body;

    // Get timetable to find period start time
    const classDate = normalizeToUtcDay(date);
    const dayOfWeek = classDate.toLocaleString('en-US', { weekday: 'long' });
    const timetable = await Timetable.findOne({ class: classId, day: dayOfWeek });

    let periodStartTime = null;
    if (timetable && Array.isArray(timetable.schedule)) {
        const periodEntry = timetable.schedule.find(p => p.period === parseInt(period));
        if (periodEntry && periodEntry.startTime) {
            const [hours, minutes] = periodEntry.startTime.split(':');
            periodStartTime = new Date(classDate);
            periodStartTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        }
    }

    const expiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);

    const qrSession = new QRSession({
      faculty: req.user._id,
      class: classId,
      subject: subjectId,
      date: classDate,
      period: parseInt(period),
      qrCode: 'pending',
      expiresAt,
      periodStartTime: periodStartTime
    });

    await qrSession.save();
    rotateTokenIfNeeded(qrSession, true);
    await qrSession.save();

    const classData = await Class.findById(classId);
    const subjectData = await Subject.findById(subjectId);

    res.json({
      qrCode: qrSession.qrCode,
      sessionId: qrSession._id,
      expiresAt,
      validityMinutes,
      qrRotationSeconds: 10,
      className: classData?.className,
      subjectName: subjectData?.subjectName,
      period: parseInt(period),
      date: new Date(date).toLocaleDateString(),
      checkInUrl: `/student-dashboard.html?scan=true&session=${qrSession._id}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:sessionId', auth, async (req, res) => {
  try {
    const session = await QRSession.findById(req.params.sessionId)
      .populate('faculty', 'name')
      .populate('class', 'className')
      .populate('subject', 'subjectName')
      .populate('checkIns.student', 'name');

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const classData = await Class.findById(session.class);
    const totalStudents = classData?.students?.length || 0;

    res.json({
      session: {
        _id: session._id,
        className: session.class?.className,
        subjectName: session.subject?.subjectName,
        facultyName: session.faculty?.name,
        date: session.date,
        period: session.period,
        expiresAt: session.expiresAt,
        isActive: session.isActive && new Date() < session.expiresAt,
        totalStudents,
        checkedIn: session.checkIns.length,
        checkIns: session.checkIns
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/payload/:sessionId', auth, roleCheck('faculty', 'admin'), async (req, res) => {
  try {
    const session = await QRSession.findById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (req.user.role === 'faculty' && String(session.faculty) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Not authorized for this session' });
    }

    if (!session.isActive || new Date() > session.expiresAt) {
      return res.status(400).json({ error: 'Session expired' });
    }

    const changed = rotateTokenIfNeeded(session);
    if (changed) {
      await session.save();
    }

    res.json({
      sessionId: session._id,
      qrCode: session.qrCode,
      expiresAt: session.expiresAt,
      nextRotationAt: new Date(new Date(session.qrTokenUpdatedAt).getTime() + QR_ROTATION_MS)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/active', auth, roleCheck('faculty', 'admin'), async (req, res) => {
  try {
    const sessions = await QRSession.find({
      faculty: req.user._id,
      isActive: true,
      expiresAt: { $gt: new Date() }
    })
      .populate('class', 'className')
      .populate('subject', 'subjectName')
      .sort({ createdAt: -1 });

    const activeSessions = await Promise.all(sessions.map(async (session) => {
      const changed = rotateTokenIfNeeded(session);
      if (changed) {
        await session.save();
      }

      const classData = await Class.findById(session.class);
      return {
        _id: session._id,
        className: session.class?.className,
        subjectName: session.subject?.subjectName,
        date: session.date,
        period: session.period,
        expiresAt: session.expiresAt,
        qrCode: session.qrCode,
        nextRotationAt: new Date(new Date(session.qrTokenUpdatedAt).getTime() + QR_ROTATION_MS),
        totalStudents: classData?.students?.length || 0,
        checkedIn: session.checkIns.length
      };
    }));

    res.json({ sessions: activeSessions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/checkin/:sessionId', auth, roleCheck('student'), async (req, res) => {
  try {
    const { token } = req.query;
    const session = await QRSession.findById(req.params.sessionId)
      .populate('class', 'className')
      .populate('subject', 'subjectName')
      .populate('faculty', 'name');

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (new Date() > session.expiresAt) {
      return res.status(400).json({ error: 'QR code expired', expired: true });
    }

    if (!isQrTokenValid(session, token)) {
      return res.status(400).json({ error: 'QR code rotated. Please scan the latest QR.', expired: true });
    }

    const student = await User.findById(req.user._id);
    const classData = await Class.findById(session.class).select('className batch year department students');
    if (!student || !classData || !isStudentAssignedToSessionClass(student, classData)) {
      return res.status(403).json({ error: 'Invalid check-in: This QR is not assigned to your class/batch.' });
    }

    res.json({
      valid: true,
      session: {
        _id: session._id,
        className: session.class?.className,
        subjectName: session.subject?.subjectName,
        facultyName: session.faculty?.name,
        date: session.date,
        period: session.period,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/submit', auth, roleCheck('student'), async (req, res) => {
  try {
    const { sessionId, qrToken } = req.body;
    
    const session = await QRSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (new Date() > session.expiresAt) {
      return res.status(400).json({ error: 'QR code expired' });
    }

    if (!isQrTokenValid(session, qrToken)) {
      return res.status(400).json({ error: 'QR code rotated. Please scan again.' });
    }

    const student = await User.findById(req.user._id);
    if (!student || student.role !== 'student') {
      return res.status(403).json({ error: 'Only students can check in' });
    }

    const classData = await Class.findById(session.class).select('batch year department students');
    if (!classData || !isStudentAssignedToSessionClass(student, classData)) {
      return res.status(403).json({ error: 'Invalid check-in: This QR is not assigned to your class/batch.' });
    }

    const alreadyCheckedIn = session.checkIns.find(
      checkIn => checkIn.student && checkIn.student.toString() === student._id.toString()
    );

    if (alreadyCheckedIn) {
      return res.status(400).json({ error: 'Already checked in' });
    }

    const dayRange = buildUtcDayRange(session.date);
    const existingAttendance = await Attendance.findOne({
      student: student._id,
      subject: session.subject,
      class: session.class,
      date: { $gte: dayRange.start, $lt: dayRange.end },
      period: session.period
    });

    if (existingAttendance) {
      return res.status(400).json({ error: 'Attendance already marked' });
    }

    // Determine status: present or late
    let status = 'present';
    const gracePeriodMinutes = 5; // Allow 5 minutes grace period
    if (session.periodStartTime) {
        const checkInTime = new Date();
        const periodStartTime = new Date(session.periodStartTime);
        const gracePeriodEndTime = new Date(periodStartTime.getTime() + gracePeriodMinutes * 60000);

        if (checkInTime > gracePeriodEndTime) {
            status = 'late';
        }
    }

    const attendance = new Attendance({
      student: student._id,
      subject: session.subject,
      class: session.class,
      date: dayRange.start,
      period: session.period,
      status: status, // Use the determined status
      markedBy: session.faculty
    });

    await attendance.save();

    session.checkIns.push({
      student: student._id,
      checkInTime: new Date(),
      ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
      userAgent: req.get('user-agent') || ''
    });
    await session.save();

    res.json({
      message: `Checked in successfully. Status: ${status}`,
      attendance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/end', auth, roleCheck('faculty', 'admin'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await QRSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    session.isActive = false;
    session.expiresAt = new Date(); // expire immediately
    await session.save();
    
    res.json({ message: 'Session ended successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

