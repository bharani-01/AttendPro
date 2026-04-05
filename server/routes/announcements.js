const express = require('express');
const router = express.Router();
const { auth, roleCheck } = require('../middleware/auth');
const announcementController = require('../controllers/announcementController');

// Create a new announcement (admin and faculty)
router.post('/', auth, roleCheck('admin', 'faculty'), announcementController.createAnnouncement);

// Get announcements for the logged-in user
router.get('/', auth, announcementController.getAnnouncements);

// Mark announcements as seen for current user
router.post('/mark-seen', auth, announcementController.markAnnouncementsSeen);

// Read analytics for a specific announcement
router.get('/:id/analytics', auth, roleCheck('admin', 'faculty'), announcementController.getAnnouncementAnalytics);

// Review a pending announcement (admin)
router.post('/:id/review', auth, roleCheck('admin'), announcementController.reviewAnnouncement);

// Get all announcements (admin only)
router.get('/all', auth, roleCheck('admin'), announcementController.getAllAnnouncements);

// Delete an announcement (admin or creator faculty)
router.delete('/:id', auth, roleCheck('admin', 'faculty'), announcementController.deleteAnnouncement);

module.exports = router;
