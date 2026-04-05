const express = require('express');
const router = express.Router();
const { auth, roleCheck } = require('../middleware/auth');
const examScheduleController = require('../controllers/examScheduleController');

router.get('/', auth, roleCheck('admin', 'faculty', 'student'), examScheduleController.list);
router.post('/publish-bulk', auth, roleCheck('admin'), examScheduleController.publishBulk);

module.exports = router;
