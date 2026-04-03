const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const { auth, roleCheck } = require('../middleware/auth');

router.post('/', auth, roleCheck('admin'), classController.create);

router.get('/', auth, classController.getAll);

router.get('/:id', auth, classController.getById);

router.put('/:id', auth, roleCheck('admin'), classController.update);

router.delete('/:id', auth, roleCheck('admin'), classController.delete);

router.post('/:id/students', auth, roleCheck('admin'), classController.addStudents);

router.delete('/:id/students/:studentId', auth, roleCheck('admin'), classController.removeStudent);

module.exports = router;
