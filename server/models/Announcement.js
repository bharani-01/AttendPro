const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const announcementSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetRoles: [{
    type: String,
    enum: ['student', 'faculty', 'admin', 'all'],
    default: ['all']
  }],
  expiresAt: {
    type: Date,
    default: null // Announcements can be permanent or have an expiry date
  }
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
