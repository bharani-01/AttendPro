const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { auth } = require('../middleware/auth');

// @route   GET /api/settings/widget/:widgetName
// @desc    Get widget settings for a user
// @access  Private
router.get('/widget/:widgetName', auth, settingsController.getWidgetSettings);

// @route   POST /api/settings/widget/:widgetName
// @desc    Save widget settings for a user
// @access  Private
router.post('/widget/:widgetName', auth, settingsController.saveWidgetSettings);

// @route   GET /api/settings/dashboard
// @desc    Get dashboard settings for a user
// @access  Private
router.get('/dashboard', auth, settingsController.getDashboardSettings);

// @route   POST /api/settings/dashboard
// @desc    Save dashboard settings for a user
// @access  Private
router.post('/dashboard', auth, settingsController.saveDashboardSettings);

module.exports = router;
