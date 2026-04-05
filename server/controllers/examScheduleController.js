const { Class, Subject, Timetable, ExamSchedule } = require('../models');

function normalizeDateOnly(dateInput) {
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

const VALID_SECTIONS = new Set(['Morning', 'Afternoon', 'Evening']);

const examScheduleController = {
  async list(req, res) {
    try {
      const query = { isPublished: true };

      if (req.user.role === 'student') {
        if (!req.user.assignedClass) {
          return res.json({ schedules: [] });
        }
        query.class = req.user.assignedClass;
      }

      if (req.user.role === 'faculty') {
        const timetableRows = await Timetable.find({ faculty: req.user._id }).select('class');
        const classIds = [...new Set(timetableRows.map((t) => String(t.class || '')).filter(Boolean))];
        if (!classIds.length) {
          return res.json({ schedules: [] });
        }
        query.class = { $in: classIds };
      }

      const schedules = await ExamSchedule.find(query)
        .populate('class', 'className department year batch section')
        .populate('subject', 'subjectName subjectCode')
        .populate('createdBy', 'name role')
        .sort({ examDate: 1, examSection: 1, createdAt: -1 });

      return res.json({ schedules });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  async publishBulk(req, res) {
    try {
      const exams = Array.isArray(req.body?.exams) ? req.body.exams : [];
      if (!exams.length) {
        return res.status(400).json({ error: 'At least one exam row is required' });
      }

      const classIds = [...new Set(exams.map((e) => String(e.classId || '')).filter(Boolean))];
      const subjectIds = [...new Set(exams.map((e) => String(e.subjectId || '')).filter(Boolean))];

      if (!classIds.length || !subjectIds.length) {
        return res.status(400).json({ error: 'classId and subjectId are required for all rows' });
      }

      const classes = await Class.find({ _id: { $in: classIds } }).select('_id className assignedSubjects');
      const subjects = await Subject.find({ _id: { $in: subjectIds } }).select('_id subjectName');

      const classMap = new Map(classes.map((c) => [String(c._id), c]));
      const subjectMap = new Map(subjects.map((s) => [String(s._id), s]));

      const payload = [];
      const failed = [];

      exams.forEach((row, index) => {
        const classId = String(row.classId || '');
        const subjectId = String(row.subjectId || '');
        const examTitle = String(row.examTitle || '').trim();
        const examSection = String(row.examSection || '').trim();
        const examDate = normalizeDateOnly(row.examDate);

        if (!examTitle || !classId || !subjectId || !examSection || !examDate) {
          failed.push({ row: index + 1, reason: 'Missing required fields' });
          return;
        }

        if (!VALID_SECTIONS.has(examSection)) {
          failed.push({ row: index + 1, reason: 'Invalid exam section' });
          return;
        }

        const classDoc = classMap.get(classId);
        if (!classDoc) {
          failed.push({ row: index + 1, reason: 'Invalid class selected' });
          return;
        }

        const subjectDoc = subjectMap.get(subjectId);
        if (!subjectDoc) {
          failed.push({ row: index + 1, reason: 'Invalid subject selected' });
          return;
        }

        const classSubjectIds = (classDoc.assignedSubjects || []).map((id) => String(id));
        if (classSubjectIds.length && !classSubjectIds.includes(subjectId)) {
          failed.push({ row: index + 1, reason: 'Subject not assigned to selected class' });
          return;
        }

        payload.push({
          examTitle,
          class: classId,
          subject: subjectId,
          examDate,
          examSection,
          isPublished: true,
          createdBy: req.user._id
        });
      });

      let insertedCount = 0;
      if (payload.length) {
        const bulk = await ExamSchedule.bulkWrite(
          payload.map((item) => ({
            updateOne: {
              filter: {
                class: item.class,
                subject: item.subject,
                examDate: item.examDate,
                examSection: item.examSection
              },
              update: {
                $setOnInsert: item
              },
              upsert: true
            }
          })),
          { ordered: false }
        );

        insertedCount = bulk.upsertedCount || 0;
      }

      return res.status(201).json({
        message: 'Exam schedule published',
        insertedCount,
        failed
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
};

module.exports = examScheduleController;
