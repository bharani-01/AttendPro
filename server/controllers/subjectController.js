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
      const { search, page, limit } = req.query;
      const query = {};

      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { subjectName: searchRegex },
          { subjectCode: searchRegex }
        ];
      }

      const parsedLimit = Number(limit || 0);
      const parsedPage = Math.max(Number(page || 1), 1);

      if (parsedLimit > 0) {
        const safeLimit = Math.min(Math.max(parsedLimit, 1), 200);
        const skip = (parsedPage - 1) * safeLimit;

        const [subjects, total] = await Promise.all([
          Subject.find(query)
            .sort({ subjectName: 1 })
            .skip(skip)
            .limit(safeLimit),
          Subject.countDocuments(query)
        ]);

        return res.json({
          subjects,
          pagination: {
            page: parsedPage,
            limit: safeLimit,
            total,
            hasMore: skip + subjects.length < total
          }
        });
      }

      const subjects = await Subject.find(query).sort({ subjectName: 1 });
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
