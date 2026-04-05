const { Class, User } = require('../models');

const classController = {
  async create(req, res) {
    try {
      const {
        className,
        department,
        year,
        batch,
        section,
        studentIds,
        assignedSubjectIds,
        lowAttendanceThreshold,
      } = req.body;

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

      if (lowAttendanceThreshold !== undefined && lowAttendanceThreshold !== null && lowAttendanceThreshold !== '') {
        const parsed = Number(lowAttendanceThreshold);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          return res.status(400).json({ error: 'lowAttendanceThreshold must be between 0 and 100' });
        }
        classData.lowAttendanceThreshold = parsed;
      }

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
      const { department, year, batch, search, page, limit } = req.query;
      const query = {};

      if (department) query.department = department;
      if (year) query.year = parseInt(year);
      if (batch) query.batch = batch;
      if (search && search.trim()) {
        query.className = { $regex: search.trim(), $options: 'i' };
      }

      const parsedLimit = Number(limit || 0);
      const parsedPage = Math.max(Number(page || 1), 1);

      if (parsedLimit > 0) {
        const safeLimit = Math.min(Math.max(parsedLimit, 1), 200);
        const skip = (parsedPage - 1) * safeLimit;

        const [classDocs, total] = await Promise.all([
          Class.find(query)
            .populate('assignedSubjects', 'subjectName subjectCode')
            .sort({ department: 1, year: 1, batch: 1, className: 1 })
            .skip(skip)
            .limit(safeLimit),
          Class.countDocuments(query)
        ]);

        const studentCountByClass = new Map();
        const classIds = classDocs.map((c) => c._id);

        if (classIds.length > 0) {
          const studentCounts = await User.aggregate([
            { $match: { role: 'student', assignedClass: { $in: classIds } } },
            { $group: { _id: '$assignedClass', count: { $sum: 1 } } }
          ]);

          studentCounts.forEach((row) => {
            studentCountByClass.set(String(row._id), row.count);
          });
        }

        const classes = classDocs.map((c) => {
          const cls = c.toObject();
          cls.students = [];
          cls.studentsCount = studentCountByClass.get(String(c._id)) || 0;
          return cls;
        });

        return res.json({
          classes,
          pagination: {
            page: parsedPage,
            limit: safeLimit,
            total,
            hasMore: skip + classes.length < total
          }
        });
      }

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

  async getClassStudents(req, res) {
    try {
      const { id } = req.params;
      const { search, page, limit } = req.query;

      const classData = await Class.findById(id).select('_id');
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      const parsedPage = Math.max(Number(page || 1), 1);
      const parsedLimit = Math.min(Math.max(Number(limit || 50), 1), 200);
      const skip = (parsedPage - 1) * parsedLimit;

      const query = { role: 'student', assignedClass: id };
      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { name: searchRegex },
          { email: searchRegex },
          { uniqueId: searchRegex }
        ];
      }

      const [students, total] = await Promise.all([
        User.find(query)
          .select('_id name email uniqueId department year batch')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parsedLimit),
        User.countDocuments(query)
      ]);

      res.json({
        students,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          hasMore: skip + students.length < total
        }
      });
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
      const { className, studentIds, assignedSubjectIds, lowAttendanceThreshold } = req.body;

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

      if (lowAttendanceThreshold !== undefined) {
        if (lowAttendanceThreshold === null || lowAttendanceThreshold === '') {
          classData.lowAttendanceThreshold = null;
        } else {
          const parsed = Number(lowAttendanceThreshold);
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
            return res.status(400).json({ error: 'lowAttendanceThreshold must be between 0 and 100' });
          }
          classData.lowAttendanceThreshold = parsed;
        }
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

      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: 'studentIds array is required' });
      }

      const classData = await Class.findById(id);
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      const currentUsers = await User.find({
        _id: { $in: studentIds }
      }).select('_id assignedClass');

      const alreadyAssigned = currentUsers.filter((u) => String(u.assignedClass || '') === String(id));

      const alreadyAssignedSet = new Set(alreadyAssigned.map((s) => String(s._id)));
      const newStudents = studentIds.filter((sId) => !alreadyAssignedSet.has(String(sId)));

      if (newStudents.length === 0) {
        const unchangedClass = await Class.findById(id)
          .populate('students')
          .populate('assignedSubjects');

        return res.json({
          message: 'No new students to add',
          class: unchangedClass
        });
      }

      const movingUsers = currentUsers.filter(
        (u) => newStudents.includes(String(u._id)) && u.assignedClass && String(u.assignedClass) !== String(id)
      );

      if (movingUsers.length > 0) {
        const oldClassIds = [...new Set(movingUsers.map((u) => String(u.assignedClass)))];
        const movingUserIds = movingUsers.map((u) => u._id);

        await Class.updateMany(
          { _id: { $in: oldClassIds } },
          { $pull: { students: { $in: movingUserIds } } }
        );
      }

      const merged = new Set((classData.students || []).map((s) => String(s)));
      newStudents.forEach((sId) => merged.add(String(sId)));
      classData.students = Array.from(merged);
      await classData.save();

      await User.updateMany(
        { _id: { $in: newStudents } },
        {
          assignedClass: id,
          department: classData.department,
          batch: classData.batch,
          year: classData.year
        }
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
  },

  async getClassSubjects(req, res) {
    try {
      const { id } = req.params;
      const { search, page, limit } = req.query;

      const classData = await Class.findById(id).populate('assignedSubjects', 'subjectName subjectCode');
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      let subjectItems = (classData.assignedSubjects || []).map((s) => s.toObject());
      if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        subjectItems = subjectItems.filter((s) => regex.test(s.subjectName || '') || regex.test(s.subjectCode || ''));
      }

      const parsedPage = Math.max(Number(page || 1), 1);
      const parsedLimit = Math.min(Math.max(Number(limit || 50), 1), 200);
      const skip = (parsedPage - 1) * parsedLimit;
      const total = subjectItems.length;
      const subjects = subjectItems.slice(skip, skip + parsedLimit);

      res.json({
        subjects,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          hasMore: skip + subjects.length < total
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async addSubjects(req, res) {
    try {
      const { id } = req.params;
      const { subjectIds } = req.body;

      if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
        return res.status(400).json({ error: 'subjectIds array is required' });
      }

      const classData = await Class.findById(id);
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      const merged = new Set((classData.assignedSubjects || []).map((s) => String(s)));
      subjectIds.forEach((subjectId) => merged.add(String(subjectId)));
      classData.assignedSubjects = Array.from(merged);
      await classData.save();

      const updatedClass = await Class.findById(id)
        .populate('students')
        .populate('assignedSubjects');

      res.json({
        message: 'Subjects added successfully',
        class: updatedClass
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async removeSubject(req, res) {
    try {
      const { id, subjectId } = req.params;

      const classData = await Class.findById(id);
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      classData.assignedSubjects = (classData.assignedSubjects || []).filter(
        (s) => String(s) !== String(subjectId)
      );
      await classData.save();

      const updatedClass = await Class.findById(id)
        .populate('students')
        .populate('assignedSubjects');

      res.json({
        message: 'Subject removed successfully',
        class: updatedClass
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = classController;

