require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { User, Class, Subject, Timetable, Attendance, Exam, Mark } = require('../models');

function getArg(name, defaultValue) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return defaultValue;
  return found.slice(prefix.length);
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
  return items[randomInt(0, items.length - 1)];
}

async function upsertUser({ name, email, role, password, uniqueId, department, year, batch, assignedClass = null, assignedSubjects = [] }) {
  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    user = new User({
      name,
      email: email.toLowerCase(),
      role,
      password,
      uniqueId,
      department,
      year,
      batch,
      assignedClass,
      assignedSubjects
    });
  } else {
    user.name = name;
    user.role = role;
    user.password = password;
    user.uniqueId = uniqueId;
    user.department = department;
    user.year = year;
    user.batch = batch;
    user.assignedClass = assignedClass;
    user.assignedSubjects = assignedSubjects;
  }

  await user.save();
  return user;
}

async function run() {
  const facultyCount = toInt(getArg('faculty', '3'), 3);
  const studentCount = toInt(getArg('students', '30'), 30);
  const className = getArg('className', 'DemoClass-Y1-A');
  const department = getArg('department', 'DemoDept');
  const year = toInt(getArg('year', '1'), 1);
  const batch = getArg('batch', `B${new Date().getFullYear()}`);
  const section = getArg('section', 'A');
  const facultyDomain = getArg('facultyDomain', 'clg');
  const studentDomain = getArg('studentDomain', 'clg');
  const legacyStudentDomain = getArg('legacyStudentDomain', 'cld');
  const password = getArg('password', '123456');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const periods = [1, 2, 3, 4, 5, 6];

  await connectDB();

  let cls = await Class.findOne({ className });
  if (!cls) {
    cls = await Class.create({ className, department, year, batch, section, students: [], assignedSubjects: [] });
  } else {
    cls.department = department;
    cls.year = year;
    cls.batch = batch;
    cls.section = section;
    await cls.save();
  }

  const subjectTemplates = [
    { name: 'Data Structures', code: 'DMO101' },
    { name: 'Discrete Math', code: 'DMO102' },
    { name: 'Computer Networks', code: 'DMO103' },
    { name: 'Operating Systems', code: 'DMO104' },
    { name: 'Database Systems', code: 'DMO105' }
  ];

  const subjects = [];
  for (const s of subjectTemplates) {
    let subject = await Subject.findOne({ subjectCode: s.code });
    if (!subject) {
      subject = await Subject.create({ subjectName: s.name, subjectCode: s.code });
    }
    subjects.push(subject);
  }

  const faculties = [];
  for (let i = 1; i <= facultyCount; i += 1) {
    const email = `f${i}@${facultyDomain}`;
    const assigned = subjects.filter((_, idx) => idx % facultyCount === (i - 1) % facultyCount).map((s) => s._id);
    const faculty = await upsertUser({
      name: `Faculty ${i}`,
      email,
      role: 'faculty',
      password,
      uniqueId: `F${i}`,
      department,
      year,
      batch,
      assignedClass: cls._id,
      assignedSubjects: assigned
    });
    faculties.push(faculty);
  }

  const students = [];
  for (let i = 1; i <= studentCount; i += 1) {
    const targetEmail = `stu${i}@${studentDomain}`;
    const legacyEmail = `stu${i}@${legacyStudentDomain}`;

    if (targetEmail !== legacyEmail) {
      const [legacyUser, targetUser] = await Promise.all([
        User.findOne({ email: legacyEmail.toLowerCase() }),
        User.findOne({ email: targetEmail.toLowerCase() })
      ]);

      if (legacyUser && !targetUser) {
        legacyUser.email = targetEmail.toLowerCase();
        await legacyUser.save();
      }
    }

    const email = `stu${i}@${studentDomain}`;
    const student = await upsertUser({
      name: `Student ${i}`,
      email,
      role: 'student',
      password,
      uniqueId: `STU${String(i).padStart(3, '0')}`,
      department,
      year,
      batch,
      assignedClass: cls._id,
      assignedSubjects: []
    });
    students.push(student);
  }

  cls.students = students.map((s) => s._id);
  cls.assignedSubjects = subjects.map((s) => s._id);
  await cls.save();

  await Timetable.deleteMany({ class: cls._id });

  const timetableRows = [];
  let slot = 0;
  for (const day of days) {
    for (const period of periods) {
      const subject = subjects[slot % subjects.length];
      const eligibleFaculty = faculties.filter((f) => (f.assignedSubjects || []).map(String).includes(String(subject._id)));
      const faculty = eligibleFaculty.length ? eligibleFaculty[0] : faculties[slot % faculties.length];

      timetableRows.push({
        class: cls._id,
        department,
        batch,
        year,
        subject: subject._id,
        faculty: faculty._id,
        day,
        period,
        roomNo: `R-${100 + period}`
      });

      slot += 1;
    }
  }

  if (timetableRows.length) {
    await Timetable.insertMany(timetableRows, { ordered: false });
  }

  // Seed attendance data for recent class sessions.
  const sessionDates = [];
  for (let offset = 1; offset <= 8; offset += 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    sessionDates.push(d);
  }

  const attendanceBulkOps = [];
  for (const date of sessionDates) {
    const day = date.toLocaleDateString('en-US', { weekday: 'long' });
    const daySlots = timetableRows.filter((t) => t.day === day).slice(0, 3);

    for (const slotRow of daySlots) {
      for (const student of students) {
        const roll = randomInt(1, 100);
        const status = roll <= 82 ? 'present' : roll <= 95 ? 'late' : 'absent';

        attendanceBulkOps.push({
          updateOne: {
            filter: {
              student: student._id,
              subject: slotRow.subject,
              class: cls._id,
              date,
              period: slotRow.period
            },
            update: {
              $set: {
                status,
                markedBy: slotRow.faculty,
                updatedAt: new Date()
              },
              $setOnInsert: {
                createdAt: new Date()
              }
            },
            upsert: true
          }
        });
      }
    }
  }

  if (attendanceBulkOps.length) {
    await Attendance.bulkWrite(attendanceBulkOps, { ordered: false });
  }

  // Seed CA exams and marks data.
  const examTemplates = [
    { examName: 'CA1', examType: 'ca1', marksType: 'written', totalMarks: 50, internalOutOf: 0 },
    { examName: 'CA2', examType: 'ca2', marksType: 'written', totalMarks: 50, internalOutOf: 0 },
    { examName: 'CA3', examType: 'ca3', marksType: 'internal', totalMarks: 25, internalOutOf: 25 }
  ];

  const exams = [];
  for (const t of examTemplates) {
    let exam = await Exam.findOne({
      examName: t.examName,
      examType: t.examType,
      marksType: t.marksType,
      applicableClasses: cls._id
    });

    if (!exam) {
      exam = await Exam.create({
        examName: t.examName,
        examType: t.examType,
        marksType: t.marksType,
        totalMarks: t.totalMarks,
        internalOutOf: t.internalOutOf,
        applicableClasses: [cls._id],
        isActive: true,
        createdBy: faculties[0]._id
      });
    } else {
      exam.totalMarks = t.totalMarks;
      exam.internalOutOf = t.internalOutOf;
      exam.isActive = true;
      if (!(exam.applicableClasses || []).map(String).includes(String(cls._id))) {
        exam.applicableClasses.push(cls._id);
      }
      await exam.save();
    }

    exams.push(exam);
  }

  const facultyBySubject = new Map();
  for (const row of timetableRows) {
    if (!facultyBySubject.has(String(row.subject))) {
      facultyBySubject.set(String(row.subject), row.faculty);
    }
  }

  const marksBulkOps = [];
  for (const exam of exams) {
    for (const subject of subjects) {
      const enteredBy = facultyBySubject.get(String(subject._id)) || faculties[0]._id;

      for (const student of students) {
        const written = exam.marksType === 'internal' ? 0 : randomInt(Math.floor(exam.totalMarks * 0.45), exam.totalMarks);
        const internal = exam.marksType === 'written' ? 0 : randomInt(Math.floor(exam.internalOutOf * 0.5), exam.internalOutOf);

        marksBulkOps.push({
          updateOne: {
            filter: {
              exam: exam._id,
              class: cls._id,
              subject: subject._id,
              student: student._id
            },
            update: {
              $set: {
                marksObtained: written,
                internalMarksObtained: internal,
                remarks: randomChoice(['Good', 'Average', 'Needs improvement', 'Consistent effort']),
                enteredBy
              }
            },
            upsert: true
          }
        });
      }
    }
  }

  if (marksBulkOps.length) {
    await Mark.bulkWrite(marksBulkOps, { ordered: false });
  }

  console.log('==========================================');
  console.log('Seed completed successfully');
  console.log(`Class: ${className}`);
  console.log(`Department/Year/Batch: ${department} / ${year} / ${batch}`);
  console.log(`Faculty: ${facultyCount} | Students: ${studentCount}`);
  console.log(`Attendance records seeded: ${attendanceBulkOps.length}`);
  console.log(`Exam records ready: ${exams.length} (CA1, CA2, CA3)`);
  console.log(`Marks rows processed: ${marksBulkOps.length}`);
  console.log('');
  console.log('Faculty credentials (password is same for all):');
  faculties.forEach((f) => {
    console.log(`- ${f.email} / ${password}`);
  });
  console.log('');
  console.log('First 10 student credentials:');
  students.slice(0, 10).forEach((s) => {
    console.log(`- ${s.email} / ${password}`);
  });
  if (students.length > 10) {
    console.log(`... and ${students.length - 10} more students`);
  }
  console.log('==========================================');

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('Seed failed:', err.message);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
