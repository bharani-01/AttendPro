const mongoose = require('mongoose');

const substitutionSchema = new mongoose.Schema({
    originalFaculty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    substituteFaculty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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
    date: {
        type: Date,
        required: true
    },
    period: {
        type: String, // e.g., "1", "2", "3-4"
        required: true
    },
    reason: {
        type: String,
        default: 'N/A'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

// Index to quickly find substitutions for a given date
substitutionSchema.index({ date: 1 });

const Substitution = mongoose.model('Substitution', substitutionSchema);

module.exports = Substitution;
