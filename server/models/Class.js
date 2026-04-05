const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  className: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  batch: {
    type: String,
    trim: true
  },
  year: {
    type: Number,
    required: true
  },
  section: {
    type: String,
    trim: true
  },
  lowAttendanceThreshold: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  assignedSubjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

classSchema.index({ department: 1, year: 1, batch: 1 }, { unique: true });

module.exports = mongoose.model('Class', classSchema);
