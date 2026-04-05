const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { auth, roleCheck } = require('../middleware/auth');

router.post('/mark', auth, roleCheck('faculty', 'admin'), attendanceController.markAttendance);

router.post('/bulk', auth, roleCheck('faculty', 'admin'), attendanceController.bulkMarkAttendance);

router.get('/', auth, roleCheck('admin', 'faculty'), attendanceController.getAttendance);

router.get('/student/summary/:studentId', auth, roleCheck('admin', 'faculty'), attendanceController.getStudentAttendanceSummary);
router.get('/student/summary', auth, roleCheck('student'), attendanceController.getStudentAttendanceSummary);

router.get('/student/:studentId', auth, roleCheck('admin', 'faculty'), attendanceController.getStudentAttendance);
router.get('/student', auth, roleCheck('student'), attendanceController.getStudentAttendance);

router.get('/class', auth, roleCheck('faculty', 'admin'), attendanceController.getClassAttendance);

router.get('/report', auth, roleCheck('admin', 'faculty'), attendanceController.getReport);

router.get('/low-attendance-report', auth, roleCheck('admin'), attendanceController.getLowAttendanceReport);
router.post('/low-attendance-report/send', auth, roleCheck('admin'), attendanceController.sendLowAttendanceEmails);

router.get('/export', auth, roleCheck('admin', 'faculty'), attendanceController.exportCSV);

router.put('/:id', auth, roleCheck('faculty', 'admin'), attendanceController.updateAttendance);

module.exports = router;
