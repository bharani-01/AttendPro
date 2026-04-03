require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/database');

const User = require('./models/User');
const Subject = require('./models/Subject');
const Class = require('./models/Class');
const Timetable = require('./models/Timetable');

async function seedDatabase() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    await User.deleteMany({});
    await Subject.deleteMany({});
    await Class.deleteMany({});
    await Timetable.deleteMany({});
    console.log('Cleared existing data');

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@college.edu',
      password: 'admin123',
      role: 'admin'
    });
    console.log('Admin created:', admin.email);

    const faculty1 = await User.create({
      name: 'John Smith',
      email: 'john.smith@college.edu',
      password: 'faculty123',
      role: 'faculty'
    });

    const faculty2 = await User.create({
      name: 'Sarah Johnson',
      email: 'sarah.johnson@college.edu',
      password: 'faculty123',
      role: 'faculty'
    });
    console.log('Faculty members created');

    const subject1 = await Subject.create({
      subjectName: 'Data Structures',
      subjectCode: 'CS201'
    });

    const subject2 = await Subject.create({
      subjectName: 'Database Management',
      subjectCode: 'CS301'
    });

    const subject3 = await Subject.create({
      subjectName: 'Web Development',
      subjectCode: 'CS302'
    });

    const subject4 = await Subject.create({
      subjectName: 'Mathematics',
      subjectCode: 'MATH101'
    });
    console.log('Subjects created');

    await User.findByIdAndUpdate(faculty1._id, {
      assignedSubjects: [subject1._id, subject3._id]
    });

    await User.findByIdAndUpdate(faculty2._id, {
      assignedSubjects: [subject2._id, subject4._id]
    });

    const student1 = await User.create({
      name: 'Alice Brown',
      email: 'alice@student.edu',
      password: 'student123',
      role: 'student'
    });

    const student2 = await User.create({
      name: 'Bob Wilson',
      email: 'bob@student.edu',
      password: 'student123',
      role: 'student'
    });

    const student3 = await User.create({
      name: 'Charlie Davis',
      email: 'charlie@student.edu',
      password: 'student123',
      role: 'student'
    });

    const student4 = await User.create({
      name: 'Diana Miller',
      email: 'diana@student.edu',
      password: 'student123',
      role: 'student'
    });

    const student5 = await User.create({
      name: 'Eve Taylor',
      email: 'eve@student.edu',
      password: 'student123',
      role: 'student'
    });
    console.log('Students created');

    const class1 = await Class.create({
      className: 'Computer Science - Year 2',
      students: [student1._id, student2._id, student3._id],
      assignedSubjects: [subject1._id, subject2._id, subject3._id]
    });

    const class2 = await Class.create({
      className: 'Computer Science - Year 3',
      students: [student4._id, student5._id],
      assignedSubjects: [subject2._id, subject3._id, subject4._id]
    });
    console.log('Classes created');

    await User.findByIdAndUpdate(student1._id, { assignedClass: class1._id });
    await User.findByIdAndUpdate(student2._id, { assignedClass: class1._id });
    await User.findByIdAndUpdate(student3._id, { assignedClass: class1._id });
    await User.findByIdAndUpdate(student4._id, { assignedClass: class2._id });
    await User.findByIdAndUpdate(student5._id, { assignedClass: class2._id });

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const timetableEntries = [
      { class: class1._id, subject: subject1._id, faculty: faculty1._id, day: 'Monday', period: 1 },
      { class: class1._id, subject: subject2._id, faculty: faculty2._id, day: 'Monday', period: 2 },
      { class: class1._id, subject: subject3._id, faculty: faculty1._id, day: 'Monday', period: 3 },
      { class: class1._id, subject: subject1._id, faculty: faculty1._id, day: 'Tuesday', period: 1 },
      { class: class1._id, subject: subject3._id, faculty: faculty1._id, day: 'Tuesday', period: 2 },
      { class: class1._id, subject: subject2._id, faculty: faculty2._id, day: 'Wednesday', period: 1 },
      { class: class2._id, subject: subject2._id, faculty: faculty2._id, day: 'Monday', period: 1 },
      { class: class2._id, subject: subject4._id, faculty: faculty2._id, day: 'Tuesday', period: 1 },
      { class: class2._id, subject: subject3._id, faculty: faculty1._id, day: 'Wednesday', period: 1 },
    ];

    await Timetable.insertMany(timetableEntries);
    console.log('Timetable entries created');

    console.log('\n========================================');
    console.log('Database seeded successfully!');
    console.log('========================================\n');
    console.log('Test Credentials:');
    console.log('---------------------------------------');
    console.log('Admin:  admin@college.edu / admin123');
    console.log('Faculty: john.smith@college.edu / faculty123');
    console.log('Faculty: sarah.johnson@college.edu / faculty123');
    console.log('Student: alice@student.edu / student123');
    console.log('Student: bob@student.edu / student123');
    console.log('---------------------------------------\n');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
