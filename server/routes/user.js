const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const userController = require('../controllers/userController');

// @route   GET api/user/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, userController.getProfile);

// @route   PUT api/user/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, userController.updateProfile);

// @route   PUT api/user/password
// @desc    Change user password
// @access  Private
router.put('/password', auth, userController.changePassword);

// @route   PUT api/user/dashboard-settings
// @desc    Update dashboard settings
// @access  Private
router.put('/dashboard-settings', auth, userController.updateDashboardSettings);

module.exports = router;
