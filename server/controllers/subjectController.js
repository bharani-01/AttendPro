const { Subject } = require('../models');

const subjectController = {
  async create(req, res) {
    try {
      const { subjectName, subjectCode } = req.body;

      if (!subjectName || !subjectCode) {
        return res.status(400).json({ error: 'Subject name and code are required' });
      }

      const existingSubject = await Subject.findOne({ 
        subjectCode: subjectCode.toUpperCase() 
      });
      
      if (existingSubject) {
        return res.status(400).json({ error: 'Subject code already exists' });
      }

      const subject = new Subject({
        subjectName,
        subjectCode: subjectCode.toUpperCase()
      });

      await subject.save();

      res.status(201).json({
        message: 'Subject created successfully',
        subject
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Subject code already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  },

  async getAll(req, res) {
    try {
      const subjects = await Subject.find().sort({ subjectName: 1 });
      res.json({ subjects });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getById(req, res) {
    try {
      const subject = await Subject.findById(req.params.id);
      
      if (!subject) {
        return res.status(404).json({ error: 'Subject not found' });
      }

      res.json({ subject });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { subjectName, subjectCode } = req.body;

      const subject = await Subject.findById(id);
      if (!subject) {
        return res.status(404).json({ error: 'Subject not found' });
      }

      if (subjectName) subject.subjectName = subjectName;
      if (subjectCode) subject.subjectCode = subjectCode.toUpperCase();

      await subject.save();

      res.json({ message: 'Subject updated successfully', subject });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async delete(req, res) {
    try {
      const subject = await Subject.findByIdAndDelete(req.params.id);
      
      if (!subject) {
        return res.status(404).json({ error: 'Subject not found' });
      }

      res.json({ message: 'Subject deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = subjectController;
