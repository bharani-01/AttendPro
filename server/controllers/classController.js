const { Class, User } = require('../models');

const classController = {
  async create(req, res) {
    try {
      const { className, department, year, batch, section, studentIds, assignedSubjectIds } = req.body;

      if (!className || !department || !year) {
        return res.status(400).json({ error: 'Class name, department and year are required' });
      }

      const existingClass = await Class.findOne({ className });
      if (existingClass) {
        return res.status(400).json({ error: 'Class name already exists' });
      }

      const classData = {
        className,
        department,
        year: parseInt(year),
        batch: batch || '',
        section: section || '',
        students: studentIds || [],
        assignedSubjects: assignedSubjectIds || []
      };

      const newClass = new Class(classData);
      await newClass.save();

      if (studentIds && studentIds.length > 0) {
        await User.updateMany(
          { _id: { $in: studentIds } },
          { assignedClass: newClass._id, department, batch, year: parseInt(year) }
        );
      }

      const populatedClass = await Class.findById(newClass._id)
        .populate('students')
        .populate('assignedSubjects');

      res.status(201).json({
        message: 'Class created successfully',
        class: populatedClass
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getAll(req, res) {
    try {
      const { department, year, batch } = req.query;
      const query = {};

      if (department) query.department = department;
      if (year) query.year = parseInt(year);
      if (batch) query.batch = batch;

      let classes = await Class.find(query)
        .populate('students', 'name email role department batch year')
        .populate('assignedSubjects')
        .sort({ department: 1, year: 1, batch: 1, className: 1 });

      classes = await Promise.all(classes.map(async (c) => {
        let cls = c.toObject();
        // Fallback dynamic students array
        if (!cls.students || cls.students.length === 0) {
            const actualStudents = await User.find({ role: 'student', assignedClass: cls._id }, '_id name email role department batch year');
            cls.students = actualStudents;
        }
        return cls;
      }));

      res.json({ classes });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getById(req, res) {
    try {
      let classData = await Class.findById(req.params.id)
        .populate('students')
        .populate('assignedSubjects');

      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      // Fetch students assigned to this class dynamically 
      const actualStudents = await User.find({ role: 'student', assignedClass: req.params.id }, '-password');
      
      classData = classData.toObject();
      classData.students = actualStudents;

      res.json({ class: classData });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { className, studentIds, assignedSubjectIds } = req.body;

      const classData = await Class.findById(id);
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      if (className) classData.className = className;

      if (studentIds !== undefined) {
        const oldStudentIds = classData.students;
        const newStudentIds = studentIds;

        const removedStudents = oldStudentIds.filter(
          s => !newStudentIds.includes(s.toString())
        );
        const addedStudents = newStudentIds.filter(
          s => !oldStudentIds.map(os => os.toString()).includes(s)
        );

        if (removedStudents.length > 0) {
          await User.updateMany(
            { _id: { $in: removedStudents } },
            { assignedClass: null }
          );
        }

        if (addedStudents.length > 0) {
          await User.updateMany(
            { _id: { $in: addedStudents } },
            { assignedClass: id }
          );
        }

        classData.students = studentIds;
      }

      if (assignedSubjectIds !== undefined) {
        classData.assignedSubjects = assignedSubjectIds;
      }

      await classData.save();

      const updatedClass = await Class.findById(id)
        .populate('students')
        .populate('assignedSubjects');

      res.json({ message: 'Class updated successfully', class: updatedClass });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async delete(req, res) {
    try {
      const classData = await Class.findById(req.params.id);
      
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      await User.updateMany(
        { assignedClass: classData._id },
        { assignedClass: null }
      );

      await Class.findByIdAndDelete(classData._id);

      res.json({ message: 'Class deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async addStudents(req, res) {
    try {
      const { id } = req.params;
      const { studentIds } = req.body;

      const classData = await Class.findById(id);
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      const newStudents = studentIds.filter(
        sId => !classData.students.map(s => s.toString()).includes(sId)
      );

      classData.students.push(...newStudents);
      await classData.save();

      await User.updateMany(
        { _id: { $in: newStudents } },
        { assignedClass: id }
      );

      const updatedClass = await Class.findById(id)
        .populate('students')
        .populate('assignedSubjects');

      res.json({ 
        message: 'Students added successfully', 
        class: updatedClass 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async removeStudent(req, res) {
    try {
      const { id, studentId } = req.params;

      const classData = await Class.findById(id);
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      classData.students = classData.students.filter(
        s => s.toString() !== studentId
      );
      await classData.save();

      await User.findByIdAndUpdate(studentId, { assignedClass: null });

      const updatedClass = await Class.findById(id)
        .populate('students')
        .populate('assignedSubjects');

      res.json({ 
        message: 'Student removed successfully', 
        class: updatedClass 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = classController;

