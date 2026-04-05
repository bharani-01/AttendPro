const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { Announcement, User, Class } = require('../models');

function sameId(a, b) {
  return String(a || '') === String(b || '');
}

async function ensureAnnouncement(payload) {
  const existing = await Announcement.findOne({
    title: payload.title,
    createdBy: payload.createdBy,
    targetClass: payload.targetClass || null
  });

  if (existing) {
    return { created: false, announcement: existing };
  }

  const announcement = await Announcement.create(payload);
  return { created: true, announcement };
}

async function seedDemoAnnouncements() {
  await connectDB();

  try {
    const [admin] = await User.find({ role: 'admin' }).sort({ createdAt: 1 }).limit(1);
    const [faculty] = await User.find({ role: 'faculty' }).sort({ createdAt: 1 }).limit(1);
    const classes = await Class.find({}).sort({ className: 1 }).limit(3);

    if (!admin && !faculty) {
      console.log('No admin/faculty users found. Nothing to seed.');
      return;
    }

    const primaryClass = classes[0] || null;
    const secondaryClass = classes[1] || primaryClass || null;

    const creatorAdmin = admin?._id || faculty._id;
    const creatorFaculty = faculty?._id || admin?._id;

    const templates = [
      {
        title: 'Demo: Internal Marks Updated',
        content: 'Internal marks for CA-2 have been published. Please check your marks page and report discrepancies by tomorrow 4 PM.',
        createdBy: creatorAdmin,
        targetRoles: ['student'],
        targetClass: primaryClass?._id || null,
        expiresAt: null
      },
      {
        title: 'Demo: Assignment Due Reminder',
        content: 'Reminder: Submit your DBMS assignment before Friday 5 PM. Late submissions may lose marks as per policy.',
        createdBy: creatorFaculty,
        targetRoles: ['student'],
        targetClass: primaryClass?._id || null,
        expiresAt: null
      },
      {
        title: 'Demo: Exam Alert',
        content: 'Mid-sem practical exam schedule is now available. Verify your slot and lab number from the timetable section.',
        createdBy: creatorAdmin,
        targetRoles: ['student', 'faculty'],
        targetClass: null,
        expiresAt: null
      },
      {
        title: 'Demo: Holiday Notice',
        content: 'College will remain closed on Monday due to a public holiday. Regular classes resume on Tuesday.',
        createdBy: creatorAdmin,
        targetRoles: ['all'],
        targetClass: null,
        expiresAt: null
      },
      {
        title: 'Demo: Class Mentor Meeting',
        content: 'A short mentor follow-up meeting is scheduled in the last period. Attendance is mandatory for the selected class.',
        createdBy: creatorFaculty,
        targetRoles: ['student'],
        targetClass: secondaryClass?._id || null,
        expiresAt: null
      }
    ].filter((row) => !!row.createdBy);

    let createdCount = 0;
    let existingCount = 0;

    for (const payload of templates) {
      const result = await ensureAnnouncement(payload);
      if (result.created) createdCount += 1;
      else existingCount += 1;
    }

    console.log(`Demo announcements seeding complete. Created: ${createdCount}, Existing: ${existingCount}`);

    const demoAnnouncements = await Announcement.find({ title: /^Demo:/ })
      .populate('createdBy', 'name role')
      .populate('targetClass', 'className')
      .sort({ createdAt: -1 })
      .limit(10);

    console.log('\nLatest Demo Announcements:');
    demoAnnouncements.forEach((ann) => {
      const roles = Array.isArray(ann.targetRoles) ? ann.targetRoles.join(',') : '';
      console.log(`- ${ann.title} | by=${ann.createdBy?.name || 'Unknown'} | roles=${roles} | class=${ann.targetClass?.className || 'All Classes'}`);
    });
  } finally {
    await mongoose.connection.close();
  }
}

seedDemoAnnouncements().catch((error) => {
  console.error('Failed to seed demo announcements:', error.message);
  process.exit(1);
});
