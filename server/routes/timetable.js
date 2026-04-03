const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');
const { auth, roleCheck } = require('../middleware/auth');

router.post('/', auth, roleCheck('admin'), timetableController.create);

router.get('/', auth, timetableController.getAll);

router.get('/today', auth, timetableController.getTodayTimetable);

router.get('/faculty/today', auth, roleCheck('faculty', 'admin'), timetableController.getTodayTimetable);

router.get('/class/:classId/day/:day', auth, timetableController.getByClassAndDay);

router.put('/:id', auth, roleCheck('admin'), timetableController.update);

router.delete('/:id', auth, roleCheck('admin'), timetableController.delete);

module.exports = router;
