const express = require('express');
const router = express.Router();
const { Attendance, Class, Subject } = require('../models');
const { auth, roleCheck } = require('../middleware/auth');

router.get('/excel', auth, roleCheck('admin', 'faculty'), async (req, res) => {
  try {
    const { classId, subjectId, startDate, endDate } = req.query;
    
    let matchQuery = {};
    if (classId) matchQuery.class = classId;
    if (subjectId) matchQuery.subject = subjectId;
    if (startDate && endDate) {
      matchQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const attendances = await Attendance.find(matchQuery)
      .populate('student', 'name email')
      .populate('subject', 'subjectName')
      .populate('class', 'className')
      .populate('markedBy', 'name')
      .sort({ date: -1 });

    let csv = 'Date,Period,Class,Subject,Student Name,Student Email,Status,Marked By\n';
    
    attendances.forEach(a => {
      csv += `${new Date(a.date).toLocaleDateString()},${a.period},${a.class?.className || ''},${a.subject?.subjectName || ''},${a.student?.name || ''},${a.student?.email || ''},${a.status},${a.markedBy?.name || ''}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pdf', auth, roleCheck('admin', 'faculty'), async (req, res) => {
  try {
    const { classId, subjectId, startDate, endDate } = req.query;
    
    let matchQuery = {};
    if (classId) matchQuery.class = classId;
    if (subjectId) matchQuery.subject = subjectId;
    if (startDate && endDate) {
      matchQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const attendances = await Attendance.find(matchQuery)
      .populate('student', 'name email')
      .populate('subject', 'subjectName')
      .populate('class', 'className')
      .sort({ date: -1 });

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

    const stats = summary[0] || { total: 0, present: 0, absent: 0 };
    stats.percentage = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(2) : 0;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Attendance Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; }
          .summary { background: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #4a90e2; color: white; }
          tr:nth-child(even) { background: #f9f9f9; }
          .present { color: green; }
          .absent { color: red; }
        </style>
      </head>
      <body>
        <h1>Attendance Report</h1>
        <div class="summary">
          <h3>Summary</h3>
          <p>Total: ${stats.total} | Present: ${stats.present} | Absent: ${stats.absent} | Percentage: ${stats.percentage}%</p>
          <p>Period: ${startDate || 'All'} to ${endDate || 'All'}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Period</th>
              <th>Class</th>
              <th>Subject</th>
              <th>Student</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${attendances.map(a => `
              <tr>
                <td>${new Date(a.date).toLocaleDateString()}</td>
                <td>${a.period}</td>
                <td>${a.class?.className || 'N/A'}</td>
                <td>${a.subject?.subjectName || 'N/A'}</td>
                <td>${a.student?.name || 'N/A'}</td>
                <td class="${a.status}">${a.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.html');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
