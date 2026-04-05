const { Exam, Mark, User, Class, Subject, Timetable, AuditLog } = require('../models');

function asNumber(value, defaultValue = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function computeMarkPercentage(exam, mark) {
  const marksType = exam?.marksType || 'written';

  if (marksType === 'internal') {
    const denominator = Number(exam?.internalOutOf || 0);
    const obtained = Number(mark?.internalMarksObtained || 0);
    return denominator > 0 ? Number(((obtained / denominator) * 100).toFixed(2)) : 0;
  }

  const denominator = Number(exam?.totalMarks || 0);
  const obtained = Number(mark?.marksObtained || 0);
  return denominator > 0 ? Number(((obtained / denominator) * 100).toFixed(2)) : 0;
}

async function validateFacultyScope(reqUser, classId, subjectId) {
  if (reqUser.role !== 'faculty') return;

  const assignedSubjects = Array.isArray(reqUser.assignedSubjects)
    ? reqUser.assignedSubjects.map((id) => String(id))
    : [];

  if (assignedSubjects.length && !assignedSubjects.includes(String(subjectId))) {
    throw new Error('Faculty can only enter marks for assigned subjects.');
  }

  const hasTimetableAssignment = await Timetable.exists({
    faculty: reqUser._id,
    class: classId,
    subject: subjectId
  });

  if (!hasTimetableAssignment) {
    throw new Error('No timetable assignment found for this class and subject.');
  }
}

const marksController = {
  async createExam(req, res) {
    try {
      const {
        examName,
        examType = 'regular',
        marksType = 'written',
        totalMarks,
        internalOutOf = 0,
        classIds = [],
        isActive = true
      } = req.body;

      if (!examName || !String(examName).trim()) {
        return res.status(400).json({ error: 'examName is required' });
      }

      const normalizedExamType = String(examType || 'regular').toLowerCase();
      const normalizedMarksType = String(marksType || 'written').toLowerCase();

      if (!['regular', 'ca1', 'ca2', 'ca3', 'midterm', 'model', 'assignment', 'custom'].includes(normalizedExamType)) {
        return res.status(400).json({ error: 'Invalid examType' });
      }

      if (!['written', 'internal', 'mixed'].includes(normalizedMarksType)) {
        return res.status(400).json({ error: 'Invalid marksType' });
      }

      if (!Array.isArray(classIds) || !classIds.length) {
        return res.status(400).json({ error: 'Select at least one class for this exam' });
      }

      const uniqueClassIds = [...new Set(classIds.map((id) => String(id)).filter(Boolean))];
      const classCount = await Class.countDocuments({ _id: { $in: uniqueClassIds } });
      if (classCount !== uniqueClassIds.length) {
        return res.status(400).json({ error: 'One or more selected classes are invalid' });
      }

      const total = asNumber(totalMarks, NaN);
      const internal = asNumber(internalOutOf, NaN);

      if (!Number.isFinite(total) || total <= 0) {
        return res.status(400).json({ error: 'totalMarks must be greater than 0' });
      }

      if (!Number.isFinite(internal) || internal < 0 || internal > total) {
        return res.status(400).json({ error: 'internalOutOf must be between 0 and totalMarks' });
      }

      if (normalizedMarksType === 'internal' && internal <= 0) {
        return res.status(400).json({ error: 'For internal marksType, internalOutOf must be greater than 0' });
      }

      const exam = await Exam.create({
        examName: String(examName).trim(),
        examType: normalizedExamType,
        marksType: normalizedMarksType,
        totalMarks: total,
        internalOutOf: internal,
        applicableClasses: uniqueClassIds,
        isActive: !!isActive,
        createdBy: req.user._id
      });

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE',
        details: `Created exam ${exam.examName} type=${exam.examType}, marksType=${exam.marksType}, total=${exam.totalMarks}, internalOutOf=${exam.internalOutOf}, classes=${uniqueClassIds.length}`,
        entityType: 'OTHER',
        entityId: exam._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        routePath: req.originalUrl,
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      res.status(201).json({ message: 'Exam created successfully', exam });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async listExams(req, res) {
    try {
      const { includeInactive = 'false', classId = '' } = req.query;
      const query = includeInactive === 'true' && req.user.role === 'admin' ? {} : { isActive: true };

      if (classId) {
        query.applicableClasses = classId;
      }

      if (req.user.role === 'student') {
        if (!req.user.assignedClass) {
          return res.json({ exams: [] });
        }
        query.applicableClasses = req.user.assignedClass;
      }

      if (req.user.role === 'faculty') {
        const facultyTimetables = await Timetable.find({ faculty: req.user._id }).select('class');
        const facultyClassIds = [...new Set(facultyTimetables.map((t) => String(t.class || '')).filter(Boolean))];

        if (!facultyClassIds.length) {
          return res.json({ exams: [] });
        }

        if (classId && !facultyClassIds.includes(String(classId))) {
          return res.status(403).json({ error: 'Faculty can only view exams for classes assigned in timetable.' });
        }

        if (classId) {
          query.applicableClasses = classId;
        } else {
          query.applicableClasses = { $in: facultyClassIds };
        }
      }

      const exams = await Exam.find(query)
        .populate('createdBy', 'name email')
        .populate('applicableClasses', 'className department year batch')
        .sort({ createdAt: -1 });

      res.json({ exams });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async loadClassStudents(req, res) {
    try {
      const { classId } = req.query;
      if (!classId) {
        return res.status(400).json({ error: 'classId is required' });
      }

      if (req.user.role === 'faculty') {
        const hasClassInTimetable = await Timetable.exists({
          faculty: req.user._id,
          class: classId
        });

        if (!hasClassInTimetable) {
          return res.status(403).json({ error: 'You can only access students for classes assigned in your timetable.' });
        }
      }

      const students = await User.find({ role: 'student', assignedClass: classId })
        .select('_id name email uniqueId assignedClass')
        .sort({ name: 1 });

      res.json({ students });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async listMarks(req, res) {
    try {
      const { examId, classId, subjectId } = req.query;
      const query = {};

      if (examId) query.exam = examId;
      if (classId) query.class = classId;
      if (subjectId) query.subject = subjectId;

      if (req.user.role === 'student') {
        query.student = req.user._id;
      }

      if (req.user.role === 'faculty' && classId && subjectId) {
        await validateFacultyScope(req.user, classId, subjectId);
      }

      const marks = await Mark.find(query)
        .populate('exam', 'examName examType marksType totalMarks internalOutOf')
        .populate('class', 'className')
        .populate('subject', 'subjectName subjectCode')
        .populate('student', 'name email uniqueId')
        .populate('enteredBy', 'name role')
        .sort({ createdAt: -1 });

      res.json({ marks });
    } catch (error) {
      if (error.message.includes('Faculty can only') || error.message.includes('No timetable assignment')) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  },

  async upsertMarks(req, res) {
    try {
      const { examId, classId, subjectId, entries } = req.body;

      if (!examId || !classId || !subjectId || !Array.isArray(entries)) {
        return res.status(400).json({ error: 'examId, classId, subjectId and entries are required' });
      }

      const exam = await Exam.findById(examId);
      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      if (!(exam.applicableClasses || []).map((id) => String(id)).includes(String(classId))) {
        return res.status(400).json({ error: 'Selected exam is not configured for this class' });
      }

      const classData = await Class.findById(classId);
      if (!classData) {
        return res.status(404).json({ error: 'Class not found' });
      }

      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({ error: 'Subject not found' });
      }

      if (req.user.role === 'faculty') {
        await validateFacultyScope(req.user, classId, subjectId);
      }

      const results = { saved: [], failed: [] };

      for (const entry of entries) {
        try {
          const studentId = entry?.studentId;
          const marksObtained = asNumber(entry?.marksObtained, NaN);
          const internalMarksObtained = asNumber(entry?.internalMarksObtained, 0);
          const hasWrittenInput = entry?.marksObtained !== undefined && entry?.marksObtained !== null && String(entry?.marksObtained) !== '';
          const hasInternalInput = entry?.internalMarksObtained !== undefined && entry?.internalMarksObtained !== null && String(entry?.internalMarksObtained) !== '';

          if (!studentId) {
            throw new Error('studentId is required');
          }

          if (exam.marksType === 'written' && !Number.isFinite(marksObtained)) {
            throw new Error('valid marksObtained is required');
          }

          if (exam.marksType === 'internal' && !Number.isFinite(internalMarksObtained)) {
            throw new Error('valid internalMarksObtained is required');
          }

          if (exam.marksType === 'mixed' && !hasWrittenInput && !hasInternalInput) {
            throw new Error('Either written mark or internal mark is required for mixed exam');
          }

          if (exam.marksType !== 'internal' && hasWrittenInput && (marksObtained < 0 || marksObtained > exam.totalMarks)) {
            throw new Error(`marksObtained must be between 0 and ${exam.totalMarks}`);
          }

          if (hasInternalInput && (internalMarksObtained < 0 || internalMarksObtained > exam.internalOutOf)) {
            throw new Error(`internalMarksObtained must be between 0 and ${exam.internalOutOf}`);
          }

          const student = await User.findOne({ _id: studentId, role: 'student' }).select('_id assignedClass name');
          if (!student) {
            throw new Error('Student not found');
          }

          if (!student.assignedClass || String(student.assignedClass) !== String(classId)) {
            throw new Error('Student is not assigned to the selected class');
          }

          const mark = await Mark.findOneAndUpdate(
            {
              exam: examId,
              class: classId,
              subject: subjectId,
              student: studentId
            },
            {
              $set: {
                marksObtained: exam.marksType === 'internal' ? 0 : (hasWrittenInput ? marksObtained : 0),
                internalMarksObtained: exam.marksType === 'written' ? 0 : (hasInternalInput ? internalMarksObtained : 0),
                remarks: String(entry?.remarks || '').trim(),
                enteredBy: req.user._id
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          results.saved.push({ studentId: String(studentId), markId: String(mark._id) });
        } catch (err) {
          results.failed.push({ studentId: String(entry?.studentId || ''), reason: err.message });
        }
      }

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE',
        details: `Marks entry for exam=${exam.examName}, class=${classData.className}, subject=${subject.subjectName}: saved=${results.saved.length}, failed=${results.failed.length}`,
        entityType: 'OTHER',
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        routePath: req.originalUrl,
        userAgent: req.get('user-agent') || '',
        status: results.failed.length ? 'FAILED' : 'SUCCESS'
      });

      res.json({ message: 'Marks processed', results });
    } catch (error) {
      if (error.message.includes('Faculty can only') || error.message.includes('No timetable assignment')) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  },

  async getStudentMyMarks(req, res) {
    try {
      const marks = await Mark.find({ student: req.user._id })
        .populate('exam', 'examName examType marksType totalMarks internalOutOf')
        .populate('class', 'className')
        .populate('subject', 'subjectName subjectCode')
        .populate('enteredBy', 'name role')
        .sort({ createdAt: -1 });

      const rows = marks.map((m) => {
        const obtained = Number(m.marksObtained || 0);
        const percentage = computeMarkPercentage(m.exam, m);

        return {
          _id: m._id,
          exam: m.exam,
          class: m.class,
          subject: m.subject,
          marksObtained: obtained,
          internalMarksObtained: Number(m.internalMarksObtained || 0),
          percentage,
          remarks: m.remarks || '',
          updatedAt: m.updatedAt,
          enteredBy: m.enteredBy
        };
      });

      res.json({ marks: rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = marksController;
