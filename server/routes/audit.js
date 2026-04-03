const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, requireRole('admin'), auditController.getAuditLogs);
router.get('/recent', verifyToken, requireRole('admin'), auditController.getRecentActivity);
router.get('/stats', verifyToken, requireRole('admin'), auditController.getStats);

module.exports = router;
