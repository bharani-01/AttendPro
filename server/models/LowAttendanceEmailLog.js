const mongoose = require('mongoose');

const lowAttendanceEmailLogSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  cutoffDate: {
    type: Date,
    required: true,
    index: true
  },
  threshold: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 75
  },
  totalClasses: {
    type: Number,
    required: true,
    min: 0
  },
  presentClasses: {
    type: Number,
    required: true,
    min: 0
  },
  attendancePercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  recipientEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  sentAt: {
    type: Date,
    default: null
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

lowAttendanceEmailLogSchema.index({ student: 1, cutoffDate: 1, threshold: 1 }, { unique: true });

module.exports = mongoose.model('LowAttendanceEmailLog', lowAttendanceEmailLogSchema);