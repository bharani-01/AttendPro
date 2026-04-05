const mongoose = require('mongoose');

const markSchema = new mongoose.Schema({
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
    index: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  marksObtained: {
    type: Number,
    required: true,
    min: 0
  },
  internalMarksObtained: {
    type: Number,
    default: 0,
    min: 0
  },
  remarks: {
    type: String,
    trim: true,
    default: ''
  },
  enteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

markSchema.index({ exam: 1, class: 1, subject: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('Mark', markSchema);
