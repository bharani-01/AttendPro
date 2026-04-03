const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const { auth, roleCheck } = require('../middleware/auth');

router.get('/attempts', auth, roleCheck('admin'), securityController.getAttackAttempts);
router.get('/blocked-users', auth, roleCheck('admin'), securityController.getBlockedUsers);
router.post('/block-user', auth, roleCheck('admin'), securityController.blockUser);
router.post('/unblock-user', auth, roleCheck('admin'), securityController.unblockUser);

module.exports = router;
