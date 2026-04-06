const express = require('express');
const router = express.Router();
const { Attendance, User, QRSession, Class, Timetable } = require('../models');
const { auth, roleCheck } = require('../middleware/auth');

router.get('/summary', auth, async (req, res) => {
  try {
    const { classId, subjectId, startDate, endDate } = req.query;
    
    let matchQuery = {};
    if (classId) matchQuery.class = classId;
    if (subjectId) matchQuery.subject = subjectId;
    if (startDate && endDate) {
      matchQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const summary = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }
        }
      }
    ]);

    const result = summary[0] || { total: 0, present: 0, absent: 0 };
    result.attendancePercentage = result.total > 0 
      ? ((result.present / result.total) * 100).toFixed(2) 
      : 0;

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/by-student', auth, roleCheck('admin', 'faculty'), async (req, res) => {
  try {
    const { classId, subjectId, startDate, endDate } = req.query;
    
    let matchQuery = {};
    if (classId) matchQuery.class = classId;
    if (subjectId) matchQuery.subject = subjectId;
    if (startDate && endDate) {
      matchQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const byStudent = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$student',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'student'
        }
      },
      { $unwind: '$student' },
      {
        $project: {
          studentId: '$_id',
          studentName: '$student.name',
          total: 1,
          present: 1,
          absent: 1,
          percentage: {
            $cond: [
              { $gt: ['$total', 0] },
              { $multiply: [{ $divide: ['$present', '$total'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { percentage: 1 } }
    ]);

    res.json({ students: byStudent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/faculty-stats', auth, roleCheck('faculty'), async (req, res) => {
  try {
    const facultyId = req.user._id;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];

    const [todayCount, weekTimetables, faculty] = await Promise.all([
      Timetable.countDocuments({ faculty: facultyId, day: today }),
      Timetable.find({ faculty: facultyId }).populate('subject', 'subjectName'),
      User.findById(facultyId).populate('assignedSubjects')
    ]);

    const uniqueSubjectsMap = new Map();
    weekTimetables.forEach(t => {
      if (t.subject && t.subject._id) {
        uniqueSubjectsMap.set(t.subject._id.toString(), t.subject);
      }
    });

    let assignedSubjects = faculty.assignedSubjects || [];
    if (assignedSubjects.length === 0) {
      assignedSubjects = Array.from(uniqueSubjectsMap.values());
    }

    const weekCount = weekTimetables.filter(t => days.includes(t.day) && t.day !== 'Sunday').length;

    res.json({
      assignedSubjectsCount: assignedSubjects.length,
      todayPeriodsCount: todayCount,
      weekClassesCount: weekCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/by-subject', auth, roleCheck('admin', 'faculty'), async (req, res) => {
  try {
    const { classId, startDate, endDate } = req.query;
    
    let matchQuery = {};
    if (classId) matchQuery.class = classId;
    if (startDate && endDate) {
      matchQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const bySubject = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$subject',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'subjects',
          localField: '_id',
          foreignField: '_id',
          as: 'subject'
        }
      },
      { $unwind: '$subject' },
      {
        $project: {
          subjectId: '$_id',
          subjectName: '$subject.subjectName',
          total: 1,
          present: 1,
          absent: 1,
          percentage: {
            $cond: [
              { $gt: ['$total', 0] },
              { $multiply: [{ $divide: ['$present', '$total'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { percentage: 1 } }
    ]);

    res.json({ subjects: bySubject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/trends', auth, roleCheck('admin', 'faculty'), async (req, res) => {
  try {
    const { classId, subjectId, days = 30 } = req.query;
    
    let matchQuery = {};
    if (classId) matchQuery.class = classId;
    if (subjectId) matchQuery.subject = subjectId;
    matchQuery.date = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };

    const trends = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ trends });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/anomalies', auth, roleCheck('admin'), async (req, res) => {
  try {
    const anomalies = [];

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // 1) Sudden perfect attendance spikes by class/day.
    const classDaily = await Attendance.aggregate([
      { $match: { date: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            class: '$class',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
          },
          total: { $sum: 1 },
          nonAbsent: { $sum: { $cond: [{ $ne: ['$status', 'absent'] }, 1, 0] } }
        }
      },
      {
        $project: {
          classId: '$_id.class',
          day: '$_id.day',
          total: 1,
          ratio: {
            $cond: [
              { $gt: ['$total', 0] },
              { $divide: ['$nonAbsent', '$total'] },
              0
            ]
          }
        }
      },
      { $sort: { classId: 1, day: 1 } }
    ]);

    const classMap = new Map();
    classDaily.forEach((row) => {
      const key = String(row.classId);
      if (!classMap.has(key)) classMap.set(key, []);
      classMap.get(key).push(row);
    });

    const classIds = Array.from(classMap.keys());
    const classDocs = await Class.find({ _id: { $in: classIds } }).select('className');
    const classNameMap = new Map(classDocs.map((c) => [String(c._id), c.className]));

    classMap.forEach((rows, classId) => {
      rows.forEach((row, idx) => {
        if (row.total < 20 || row.ratio < 0.98) return;

        const prev = rows.slice(Math.max(0, idx - 7), idx);
        if (!prev.length) return;
        const prevAvg = prev.reduce((sum, p) => sum + p.ratio, 0) / prev.length;

        if (prevAvg <= 0.75) {
          anomalies.push({
            type: 'Perfect Attendance Spike',
            severity: 'high',
            when: row.day,
            summary: `${classNameMap.get(classId) || classId} jumped to ${(row.ratio * 100).toFixed(1)}% attendance`,
            details: `Previous 7-session average: ${(prevAvg * 100).toFixed(1)}%, records: ${row.total}`
          });
        }
      });
    });

    // 2) Same-IP rapid QR check-ins (multiple distinct students within a short window).
    const recentSessions = await QRSession.find({
      date: { $gte: thirtyDaysAgo }
    })
      .select('class subject period date checkIns')
      .populate('class', 'className')
      .populate('subject', 'subjectName');

    recentSessions.forEach((session) => {
      const byIp = new Map();
      (session.checkIns || []).forEach((c) => {
        if (!c.ipAddress || c.ipAddress === 'Unknown') return;
        const ip = c.ipAddress;
        if (!byIp.has(ip)) byIp.set(ip, []);
        byIp.get(ip).push({
          t: new Date(c.checkedInAt).getTime(),
          student: String(c.student)
        });
      });

      byIp.forEach((events, ip) => {
        events.sort((a, b) => a.t - b.t);
        let left = 0;
        for (let right = 0; right < events.length; right += 1) {
          while (events[right].t - events[left].t > 2 * 60 * 1000) {
            left += 1;
          }
          const window = events.slice(left, right + 1);
          const uniqueStudents = new Set(window.map((w) => w.student));
          if (uniqueStudents.size >= 5) {
            anomalies.push({
              type: 'Same-IP Rapid QR Check-ins',
              severity: 'high',
              when: new Date(events[right].t).toISOString(),
              summary: `${uniqueStudents.size} check-ins from IP ${ip} in ~2 min`,
              details: `Class: ${session.class?.className || 'N/A'}, Subject: ${session.subject?.subjectName || 'N/A'}, Period: ${session.period}`
            });
            break;
          }
        }
      });
    });

    // 3) Repeated late entries in recent 14 days.
    const repeatedLate = await Attendance.aggregate([
      {
        $match: {
          status: 'late',
          date: { $gte: fourteenDaysAgo }
        }
      },
      {
        $group: {
          _id: '$student',
          lateCount: { $sum: 1 },
          lastLateAt: { $max: '$date' }
        }
      },
      { $match: { lateCount: { $gte: 3 } } },
      { $sort: { lateCount: -1 } },
      { $limit: 50 }
    ]);

    const lateStudentIds = repeatedLate.map((r) => r._id);
    const lateStudents = await User.find({ _id: { $in: lateStudentIds } }).select('name email uniqueId');
    const lateStudentMap = new Map(lateStudents.map((s) => [String(s._id), s]));

    repeatedLate.forEach((r) => {
      const stu = lateStudentMap.get(String(r._id));
      anomalies.push({
        type: 'Repeated Late Entries',
        severity: r.lateCount >= 6 ? 'high' : 'medium',
        when: r.lastLateAt,
        summary: `${stu?.name || r._id} has ${r.lateCount} late records in 14 days`,
        details: `Email: ${stu?.email || 'N/A'}${stu?.uniqueId ? `, ID: ${stu.uniqueId}` : ''}`
      });
    });

    anomalies.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

    res.json({
      total: anomalies.length,
      anomalies: anomalies.slice(0, 200)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
