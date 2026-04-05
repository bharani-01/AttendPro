const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const { auth, roleCheck } = require('../middleware/auth');

router.post('/', auth, roleCheck('admin'), classController.create);

router.get('/', auth, classController.getAll);

router.get('/:id/students', auth, classController.getClassStudents);
router.get('/:id/subjects', auth, classController.getClassSubjects);

router.get('/:id', auth, classController.getById);

router.put('/:id', auth, roleCheck('admin'), classController.update);

router.delete('/:id', auth, roleCheck('admin'), classController.delete);

router.post('/:id/students', auth, roleCheck('admin'), classController.addStudents);
router.post('/:id/subjects', auth, roleCheck('admin'), classController.addSubjects);

router.delete('/:id/students/:studentId', auth, roleCheck('admin'), classController.removeStudent);
router.delete('/:id/subjects/:subjectId', auth, roleCheck('admin'), classController.removeSubject);

module.exports = router;
