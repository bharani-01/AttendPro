const mongoose = require('mongoose');

const emailEventLogSchema = new mongoose.Schema(
  {
    triggerKey: {
      type: String,
      required: true,
      trim: true,
    },
    templateKey: {
      type: String,
      default: '',
      trim: true,
    },
    recipientEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'skipped'],
      required: true,
    },
    source: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'auto',
    },
    errorMessage: {
      type: String,
      default: '',
      trim: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

emailEventLogSchema.index({ createdAt: -1 });
emailEventLogSchema.index({ triggerKey: 1, createdAt: -1 });
emailEventLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('EmailEventLog', emailEventLogSchema);