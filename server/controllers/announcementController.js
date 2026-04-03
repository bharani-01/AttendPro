const { Announcement } = require('../models');

const announcementController = {
  // Create a new announcement
  async createAnnouncement(req, res) {
    try {
      const { title, content, targetRoles, expiresAt } = req.body;
      
      if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
      }

      const announcement = new Announcement({
        title,
        content,
        createdBy: req.user._id,
        targetRoles: targetRoles || ['all'],
        expiresAt
      });

      await announcement.save();
      res.status(201).json({ message: 'Announcement created successfully', announcement });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create announcement: ' + error.message });
    }
  },

  // Get announcements for the current user's role
  async getAnnouncements(req, res) {
    try {
      const userRole = req.user.role;
      const now = new Date();

      const announcements = await Announcement.find({
        $and: [
          { $or: [{ targetRoles: 'all' }, { targetRoles: userRole }] },
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
        ]
      })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

      res.status(200).json({ announcements });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve announcements: ' + error.message });
    }
  },

  // Get all announcements (for admins)
  async getAllAnnouncements(req, res) {
    try {
      const announcements = await Announcement.find({})
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 });
      res.status(200).json({ announcements });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve all announcements: ' + error.message });
    }
  },

  // Delete an announcement
  async deleteAnnouncement(req, res) {
    try {
      const { id } = req.params;
      const announcement = await Announcement.findById(id);

      if (!announcement) {
        return res.status(404).json({ error: 'Announcement not found' });
      }

      // Optional: Check if user is the creator or an admin
      // if (announcement.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      //   return res.status(403).json({ error: 'You are not authorized to delete this announcement' });
      // }

      await announcement.remove();
      res.status(200).json({ message: 'Announcement deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete announcement: ' + error.message });
    }
  }
};

module.exports = announcementController;
