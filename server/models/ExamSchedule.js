const mongoose = require('mongoose');

const examScheduleSchema = new mongoose.Schema({
  examTitle: {
    type: String,
    required: true,
    trim: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  examDate: {
    type: Date,
    required: true
  },
  examSection: {
    type: String,
    required: true,
    trim: true,
    enum: ['Morning', 'Afternoon', 'Evening']
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

examScheduleSchema.index({ class: 1, subject: 1, examDate: 1, examSection: 1 }, { unique: true });
examScheduleSchema.index({ class: 1, examDate: 1 });

module.exports = mongoose.model('ExamSchedule', examScheduleSchema);
