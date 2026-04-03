const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  userName: {
    type: String,
    default: 'System'
  },
  userRole: {
    type: String,
    enum: ['admin', 'faculty', 'student', 'unknown'],
    default: 'unknown'
  },
  action: {
    type: String,
    enum: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'MARK_ATTENDANCE', 'UPDATE_ATTENDANCE', 'CREATE', 'UPDATE', 'DELETE'],
    required: true
  },
  details: {
    type: String,
    default: ''
  },
  entityType: {
    type: String,
    enum: ['AUTH', 'ATTENDANCE', 'USER', 'SUBJECT', 'CLASS', 'TIMETABLE', 'OTHER'],
    default: 'OTHER'
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  ipAddress: {
    type: String,
    default: 'Unknown'
  },
  routePath: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  attemptedEmail: {
    type: String,
    default: ''
  },
  attemptCount: {
    type: Number,
    default: 1
  },
  firstAttemptAt: {
    type: Date,
    default: null
  },
  lastAttemptAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    default: 'SUCCESS'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, attemptedEmail: 1, ipAddress: 1, status: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
