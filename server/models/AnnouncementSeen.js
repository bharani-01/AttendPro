const mongoose = require('mongoose');

const announcementSeenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  announcement: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Announcement',
    required: true
  },
  seenAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

announcementSeenSchema.index({ user: 1, announcement: 1 }, { unique: true });
announcementSeenSchema.index({ user: 1, seenAt: -1 });

module.exports = mongoose.model('AnnouncementSeen', announcementSeenSchema);
