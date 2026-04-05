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
  targetClass: {
    type: Schema.Types.ObjectId,
    ref: 'Class',
    default: null
  },
  expiresAt: {
    type: Date,
    default: null // Announcements can be permanent or have an expiry date
  },
  approvalStatus: {
    type: String,
    enum: ['approved', 'pending', 'rejected'],
    default: 'approved'
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectedReason: {
    type: String,
    default: '',
    trim: true
  },
  scheduledDeleteAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

announcementSchema.index({ targetRoles: 1, targetClass: 1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
