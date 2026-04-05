const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { auth, roleCheck } = require('../middleware/auth');

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

// @route   GET /api/settings/admin-config
// @desc    Get admin configuration settings
// @access  Admin
router.get('/admin-config', auth, roleCheck('admin'), settingsController.getAdminConfig);

// @route   POST /api/settings/admin-config
// @desc    Save admin configuration settings
// @access  Admin
router.post('/admin-config', auth, roleCheck('admin'), settingsController.saveAdminConfig);

// @route   GET /api/settings/email-stats
// @desc    Get email attempts summary statistics
// @access  Admin
router.get('/email-stats', auth, roleCheck('admin'), settingsController.getEmailStats);

// @route   GET /api/settings/email-templates
// @desc    Get configurable email templates and overrides
// @access  Admin
router.get('/email-templates', auth, roleCheck('admin'), settingsController.getEmailTemplates);

// @route   POST /api/settings/email-templates
// @desc    Save email template override settings
// @access  Admin
router.post('/email-templates', auth, roleCheck('admin'), settingsController.saveEmailTemplates);

// @route   POST /api/settings/email-templates/test
// @desc    Send a template test email to a custom recipient
// @access  Admin
router.post('/email-templates/test', auth, roleCheck('admin'), settingsController.testEmailTemplate);

// @route   GET /api/settings/departments
// @desc    Get admin-managed departments list
// @access  Private
router.get('/departments', auth, settingsController.getDepartments);

// @route   POST /api/settings/departments
// @desc    Add a department to admin-managed list
// @access  Admin
router.post('/departments', auth, roleCheck('admin'), settingsController.addDepartment);

// @route   DELETE /api/settings/departments/:name
// @desc    Remove a department from admin-managed list
// @access  Admin
router.delete('/departments/:name', auth, roleCheck('admin'), settingsController.deleteDepartment);

module.exports = router;
