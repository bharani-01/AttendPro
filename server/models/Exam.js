const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  examName: {
    type: String,
    required: true,
    trim: true
  },
  examType: {
    type: String,
    enum: ['regular', 'ca1', 'ca2', 'ca3', 'midterm', 'model', 'assignment', 'custom'],
    default: 'regular'
  },
  marksType: {
    type: String,
    enum: ['written', 'internal', 'mixed'],
    default: 'written'
  },
  totalMarks: {
    type: Number,
    required: true,
    min: 1
  },
  internalOutOf: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  applicableClasses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

examSchema.index({ examName: 1, createdAt: -1 });
examSchema.index({ applicableClasses: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Exam', examSchema);
