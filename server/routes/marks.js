const express = require('express');
const router = express.Router();
const marksController = require('../controllers/marksController');
const { auth, roleCheck } = require('../middleware/auth');

router.get('/exams', auth, roleCheck('admin', 'faculty', 'student'), marksController.listExams);
router.post('/exams', auth, roleCheck('admin'), marksController.createExam);

router.get('/students', auth, roleCheck('admin', 'faculty'), marksController.loadClassStudents);
router.get('/entries', auth, roleCheck('admin', 'faculty', 'student'), marksController.listMarks);
router.post('/entries/upsert', auth, roleCheck('admin', 'faculty'), marksController.upsertMarks);
router.get('/student/me', auth, roleCheck('student'), marksController.getStudentMyMarks);

module.exports = router;
