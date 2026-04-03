const express = require('express');
const router = express.Router();
const { LeaveRequest, User } = require('../models');
const { auth, roleCheck } = require('../middleware/auth');
const { sendLeaveStatusUpdate } = require('../services/emailService');
const { sendLeaveStatusSMS } = require('../services/smsService');

router.post('/', auth, roleCheck('student'), async (req, res) => {
  try {
    const { subjectId, classId, date, period, reason } = req.body;

    const leaveRequest = new LeaveRequest({
      student: req.user._id,
      subject: subjectId,
      class: classId,
      date,
      period,
      reason
    });

    await leaveRequest.save();
    res.status(201).json({ message: 'Leave request submitted', leaveRequest });
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
      const classes = await User.findById(req.user._id).populate('assignedClass');
      if (req.user.assignedClass) {
        query.class = req.user.assignedClass._id;
      }
    }

    const leaveRequests = await LeaveRequest.find(query)
      .populate('student', 'name email')
      .populate('subject', 'subjectName')
      .populate('class', 'className')
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

    leaveRequest.status = 'approved';
    leaveRequest.reviewedBy = req.user._id;
    leaveRequest.reviewedAt = new Date();
    leaveRequest.reviewComment = req.body.comment || '';

    await leaveRequest.save();

    const student = await User.findById(leaveRequest.student);
    await sendLeaveStatusUpdate(leaveRequest, student);
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

    leaveRequest.status = 'rejected';
    leaveRequest.reviewedBy = req.user._id;
    leaveRequest.reviewedAt = new Date();
    leaveRequest.reviewComment = req.body.comment || '';

    await leaveRequest.save();

    const student = await User.findById(leaveRequest.student);
    await sendLeaveStatusUpdate(leaveRequest, student);
    await sendLeaveStatusSMS(leaveRequest, student);

    res.json({ message: 'Leave request rejected', leaveRequest });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
