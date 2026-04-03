const { Substitution, User, Class } = require('../models');

// @desc    Get all substitutions
// @route   GET /api/substitutions
// @access  Private (Admin)
exports.getSubstitutions = async (req, res) => {
    try {
        const substitutions = await Substitution.find()
            .populate('originalFaculty', 'name')
            .populate('substituteFaculty', 'name')
            .populate('class', 'name')
            .populate('subject', 'name')
            .populate('createdBy', 'name')
            .sort({ date: -1 });
        res.json({ substitutions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// @desc    Create a new substitution
// @route   POST /api/substitutions
// @access  Private (Admin)
exports.createSubstitution = async (req, res) => {
    const { originalFaculty, substituteFaculty, class: classId, date, period, reason, subject: subjectId } = req.body;

    try {
        const substitution = new Substitution({
            originalFaculty,
            substituteFaculty,
            class: classId,
            subject: subjectId,
            date,
            period,
            reason,
            createdBy: req.user.id
        });

        await substitution.save();
        res.status(201).json({ message: 'Substitution created successfully', substitution });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// @desc    Delete a substitution
// @route   DELETE /api/substitutions/:id
// @access  Private (Admin)
exports.deleteSubstitution = async (req, res) => {
    try {
        const substitution = await Substitution.findById(req.params.id);

        if (!substitution) {
            return res.status(404).json({ error: 'Substitution not found' });
        }

        await substitution.remove();
        res.json({ message: 'Substitution removed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
