const express = require('express');
const router = express.Router();
const { auth, roleCheck } = require('../middleware/auth');
const announcementController = require('../controllers/announcementController');

// Create a new announcement (admin only)
router.post('/', auth, roleCheck('admin'), announcementController.createAnnouncement);

// Get announcements for the logged-in user
router.get('/', auth, announcementController.getAnnouncements);

// Get all announcements (admin only)
router.get('/all', auth, roleCheck('admin'), announcementController.getAllAnnouncements);

// Delete an announcement (admin only)
router.delete('/:id', auth, roleCheck('admin'), announcementController.deleteAnnouncement);

module.exports = router;
