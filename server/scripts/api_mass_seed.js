/* eslint-disable no-console */

const BASE_URL = process.env.SEED_BASE_URL || 'http://127.0.0.1:3000/api';
const TARGET_STUDENTS = Number(process.env.SEED_STUDENTS || 3600);
const TARGET_FACULTY = Number(process.env.SEED_FACULTY || 220);
const TARGET_SUBJECTS = Number(process.env.SEED_SUBJECTS || 160);
const CONCURRENCY = Number(process.env.SEED_CONCURRENCY || 16);
const STUDENT_EMAIL_START = Number(process.env.SEED_STUDENT_EMAIL_START || 12345);
const FACULTY_EMAIL_START = Number(process.env.SEED_FACULTY_EMAIL_START || 5001);
const SUBJECT_CODE_START = Number(process.env.SEED_SUBJECT_CODE_START || 11);

const DEPARTMENTS = [
  'Computer Science',
  'Information Technology',
  'Electronics',
  'Mechanical',
  'Civil',
  'Electrical',
  'Artificial Intelligence',
  'Data Science'
];

const tamilFirstNames = [
  'Deepak', 'Dinesh', 'Suresh', 'Ramesh', 'Karthik', 'Praveen', 'Arun', 'Vignesh', 'Surya', 'Hari',
  'Naveen', 'Sathish', 'Madhan', 'Lokesh', 'Santhosh', 'Bala', 'Saravanan', 'Gokul', 'Mohan', 'Ashwin',
  'Keerthana', 'Nivetha', 'Divya', 'Aarthi', 'Kavya', 'Harini', 'Priyanka', 'Janani', 'Anitha', 'Ramya',
  'Swetha', 'Gayathri', 'Nandhini', 'Revathi', 'Bhavani', 'Meena', 'Suganya', 'Vidhya', 'Mahalakshmi', 'Poornima'
];

const tamilLastNames = [
  'Kumar', 'Raj', 'Mani', 'Selvam', 'Murugan', 'Velan', 'Prabhu', 'Anand', 'Babu', 'Natarajan',
  'Lakshmi', 'Priya', 'Shankar', 'Krishnan', 'Subramanian', 'Perumal', 'Ravi', 'Senthil', 'Ganesan', 'Balaji'
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

const DEPT_CODE = {
  'Computer Science': 'CSE',
  'Information Technology': 'IT',
  Electronics: 'ECE',
  Mechanical: 'MECH',
  Civil: 'CIV',
  Electrical: 'EEE',
  'Artificial Intelligence': 'AI',
  'Data Science': 'DS'
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(method, path, token, body, retry = 2) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};

    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (error) {
    if (retry > 0 && (!error.status || error.status >= 500)) {
      await delay(150);
      return request(method, path, token, body, retry - 1);
    }
    throw error;
  }
}

async function mapLimit(items, limit, worker) {
  const results = [];
  let index = 0;

  async function runOne() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runOne());
  await Promise.all(runners);
  return results;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uniqueCode(prefix, n) {
  return `${prefix}${String(n).padStart(4, '0')}`;
}

function buildSubjectTemplates(startNumber) {
  const coreByDept = {
    'Computer Science': ['Data Structures', 'Algorithms', 'DBMS', 'Operating Systems', 'Computer Networks', 'Software Engineering', 'Cloud Computing', 'Compiler Design', 'Distributed Systems', 'Web Engineering'],
    'Information Technology': ['IT Infrastructure', 'System Administration', 'Information Security', 'Web Technologies', 'Data Warehousing', 'Network Security', 'Mobile Computing', 'DevOps Practices', 'Enterprise Systems', 'Service Management'],
    'Electronics': ['Analog Circuits', 'Digital Electronics', 'Signals and Systems', 'Microprocessors', 'VLSI Design', 'Embedded Systems', 'Control Systems', 'Power Electronics', 'Communication Systems', 'Instrumentation'],
    'Mechanical': ['Thermodynamics', 'Fluid Mechanics', 'Machine Design', 'Manufacturing Process', 'Heat Transfer', 'CAD/CAM', 'Industrial Engineering', 'Automobile Engineering', 'Engineering Mechanics', 'Robotics'],
    'Civil': ['Structural Analysis', 'Surveying', 'Geotechnical Engineering', 'Concrete Technology', 'Transportation Engineering', 'Hydraulics', 'Environmental Engineering', 'Construction Management', 'Building Materials', 'Irrigation Engineering'],
    'Electrical': ['Electrical Machines', 'Power Systems', 'Circuit Theory', 'Control Engineering', 'Power Electronics', 'High Voltage Engineering', 'Renewable Energy', 'Microgrid Systems', 'Protection and Switchgear', 'Energy Auditing'],
    'Artificial Intelligence': ['Machine Learning', 'Deep Learning', 'Natural Language Processing', 'Computer Vision', 'AI Ethics', 'Reinforcement Learning', 'Probabilistic Models', 'MLOps', 'Knowledge Representation', 'AI Applications'],
    'Data Science': ['Statistics', 'Data Mining', 'Big Data Analytics', 'Data Visualization', 'Time Series Analysis', 'Data Engineering', 'Predictive Modeling', 'Business Analytics', 'Applied Probability', 'Experiment Design']
  };

  const list = [];
  let counter = startNumber;

  for (const dept of DEPARTMENTS) {
    const names = coreByDept[dept];
    for (const name of names) {
      const prefix = DEPT_CODE[dept] || dept.split(' ').map((x) => x[0]).join('').toUpperCase();
      list.push({
        subjectName: `${name} ${Math.ceil(counter / 8)}`,
        subjectCode: uniqueCode(prefix, counter),
        department: dept
      });
      counter += 1;
    }
  }

  while (list.length < TARGET_SUBJECTS) {
    const dept = pick(DEPARTMENTS);
    const prefix = DEPT_CODE[dept] || dept.split(' ').map((x) => x[0]).join('').toUpperCase();
    list.push({
      subjectName: `${dept} Elective ${list.length + 1}`,
      subjectCode: uniqueCode(prefix, counter),
      department: dept
    });
    counter += 1;
  }

  return list.slice(0, TARGET_SUBJECTS);
}

function buildClasses(stamp) {
  const classDefs = [];
  const cohortTags = ['A', 'B', 'C'];

  for (const dept of DEPARTMENTS) {
    for (let year = 1; year <= 4; year += 1) {
      for (const cohort of cohortTags) {
        const baseBatch = String(2027 - year);
        classDefs.push({
          department: dept,
          year,
          section: cohort,
          batch: `${baseBatch}-${cohort}-${stamp.slice(-4)}`,
          className: `${dept.replace(/\s+/g, '')}-Y${year}-${cohort}-${stamp.slice(-4)}`
        });
      }
    }
  }
  return classDefs;
}

async function ensureAdminToken(stamp) {
  const defaultCreds = { email: 'admin@college.edu', password: 'admin123' };

  try {
    const login = await request('POST', '/auth/login', null, defaultCreds);
    return { token: login.token, adminEmail: defaultCreds.email, adminPassword: defaultCreds.password };
  } catch (_) {
    const email = `seedadmin.${stamp}@college.edu`;
    const password = 'Attend@12345';
    const reg = await request('POST', '/auth/register', null, {
      name: 'Seed Admin',
      email,
      password,
      role: 'admin'
    });
    return { token: reg.token, adminEmail: email, adminPassword: password };
  }
}

function buildFacultyPayload(i, facultySerialBase, subjectMap) {
  const first = pick(tamilFirstNames);
  const last = pick(tamilLastNames);
  const department = DEPARTMENTS[i % DEPARTMENTS.length];
  const deptSubjects = subjectMap.get(department) || [];
  const serial = String(facultySerialBase + i).padStart(6, '0');

  const assignedSubjects = [];
  for (let k = 0; k < 3; k += 1) {
    if (deptSubjects.length === 0) break;
    assignedSubjects.push(deptSubjects[(i + k) % deptSubjects.length]);
  }

  return {
    name: `${first} ${last}`,
    email: `f${serial}@clg.edu.in`,
    password: 'Faculty@123',
    role: 'faculty',
    department,
    assignedSubjects
  };
}

function buildStudentPayload(i, studentSerialBase, classDef, assignedClass) {
  const first = pick(tamilFirstNames);
  const last = pick(tamilLastNames);
  const serial = String(studentSerialBase + i).padStart(6, '0');

  return {
    name: `${first} ${last}`,
    email: `e${serial}@clg.edu.in`,
    uniqueId: `E${serial}`,
    year: classDef.year,
    department: classDef.department,
    batch: classDef.batch,
    assignedClass
  };
}

async function main() {
  const started = Date.now();
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);

  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`Targets => students=${TARGET_STUDENTS}, faculty=${TARGET_FACULTY}, subjects=${TARGET_SUBJECTS}`);

  const { token, adminEmail, adminPassword } = await ensureAdminToken(stamp);
  console.log(`Admin ready: ${adminEmail}`);

  const baselineStats = await request('GET', '/auth/users/stats', token);
  const subjectStart = SUBJECT_CODE_START + (baselineStats.stats.totalSubjects || 0);
  const facultySerialBase = FACULTY_EMAIL_START + (baselineStats.stats.totalFaculty || 0);
  const studentSerialBase = STUDENT_EMAIL_START + (baselineStats.stats.totalStudents || 0);

  const subjectTemplates = buildSubjectTemplates(subjectStart);
  let createdSubjects = 0;
  const subjectMap = new Map(DEPARTMENTS.map((d) => [d, []]));

  await mapLimit(subjectTemplates, CONCURRENCY, async (subj, idx) => {
    try {
      const res = await request('POST', '/subjects', token, {
        subjectName: subj.subjectName,
        subjectCode: subj.subjectCode
      });
      createdSubjects += 1;
      subjectMap.get(subj.department).push(res.subject._id);
      if ((idx + 1) % 40 === 0) console.log(`Subjects progress: ${idx + 1}/${subjectTemplates.length}`);
    } catch (error) {
      // Ignore duplicates if rerun stamp accidentally overlaps.
      if (error.status !== 400) {
        console.error(`Subject error [${subj.subjectCode}]: ${error.message}`);
      }
    }
  });

  for (const dept of DEPARTMENTS) {
    if ((subjectMap.get(dept) || []).length === 0) {
      const fallback = Array.from(subjectMap.values()).flat().slice(0, 5);
      subjectMap.set(dept, fallback);
    }
  }

  console.log(`Subjects created: ${createdSubjects}`);

  const facultyInputs = Array.from({ length: TARGET_FACULTY }, (_, i) => i + 1);
  const facultyByDept = new Map(DEPARTMENTS.map((d) => [d, []]));
  let createdFaculty = 0;

  await mapLimit(facultyInputs, CONCURRENCY, async (i, idx) => {
    const payload = buildFacultyPayload(i, facultySerialBase, subjectMap);
    try {
      const res = await request('POST', '/auth/register', null, payload);
      createdFaculty += 1;
      facultyByDept.get(payload.department).push(res.user._id);
      if ((idx + 1) % 50 === 0) console.log(`Faculty progress: ${idx + 1}/${TARGET_FACULTY}`);
    } catch (error) {
      if (error.status !== 400) {
        console.error(`Faculty error [${payload.email}]: ${error.message}`);
      }
    }
  });

  console.log(`Faculty created: ${createdFaculty}`);

  const classDefs = buildClasses(stamp);
  const studentsPerClass = Math.floor(TARGET_STUDENTS / classDefs.length);
  const remainder = TARGET_STUDENTS % classDefs.length;

  let createdStudents = 0;
  let createdClasses = 0;
  let createdTimetables = 0;

  for (let classIdx = 0; classIdx < classDefs.length; classIdx += 1) {
    const classDef = classDefs[classIdx];
    const targetForClass = studentsPerClass + (classIdx < remainder ? 1 : 0);

    const deptSubjects = subjectMap.get(classDef.department) || [];

    try {
      const classRes = await request('POST', '/classes', token, {
        className: classDef.className,
        department: classDef.department,
        year: classDef.year,
        batch: classDef.batch,
        section: classDef.section,
        assignedSubjectIds: deptSubjects.slice(0, 8)
      });

      createdClasses += 1;

      const studentIndexes = Array.from({ length: targetForClass }, (_, i) => i + 1);
      await mapLimit(studentIndexes, CONCURRENCY, async (localIndex) => {
        const globalIndex = classIdx * studentsPerClass + localIndex + classIdx;
        const payload = buildStudentPayload(globalIndex, studentSerialBase, classDef, classRes.class._id);
        try {
          await request('POST', '/auth/students/add', token, payload);
          createdStudents += 1;
        } catch (error) {
          if (error.status !== 400) {
            console.error(`Student error [${payload.email}]: ${error.message}`);
          }
        }
      });

      const deptFaculty = facultyByDept.get(classDef.department) || [];
      const facultyPool = deptFaculty.length ? deptFaculty : Array.from(facultyByDept.values()).flat();
      const subjectsPool = deptSubjects.length ? deptSubjects : Array.from(subjectMap.values()).flat().slice(0, 10);

      const timetableTasks = [];
      for (const day of DAYS) {
        for (const period of PERIODS) {
          const subjectId = subjectsPool[(period + day.length) % subjectsPool.length];
          const facultyId = facultyPool[(period + day.length + classIdx) % facultyPool.length];
          timetableTasks.push({ day, period, subjectId, facultyId });
        }
      }

      await mapLimit(timetableTasks, CONCURRENCY, async (t) => {
        try {
          await request('POST', '/timetable', token, {
            classId: classRes.class._id,
            subjectId: t.subjectId,
            facultyId: t.facultyId,
            day: t.day,
            period: t.period,
            department: classDef.department,
            batch: classDef.batch,
            year: classDef.year,
            roomNo: `${classDef.section}${t.period}${(classIdx % 9) + 1}`
          });
          createdTimetables += 1;
        } catch (error) {
          if (error.status !== 400) {
            console.error(`Timetable error [${classDef.className} ${t.day}-${t.period}]: ${error.message}`);
          }
        }
      });

      if ((classIdx + 1) % 12 === 0) {
        console.log(`Class progress: ${classIdx + 1}/${classDefs.length} | students=${createdStudents} | timetables=${createdTimetables}`);
      }
    } catch (error) {
      console.error(`Class error [${classDef.className}]: ${error.message}`);
    }
  }

  const stats = await request('GET', '/auth/users/stats', token);
  const classes = await request('GET', '/classes', token);

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  console.log('================ MASS API SEED SUMMARY ================');
  console.log(`seedStamp=${stamp}`);
  console.log(`adminEmail=${adminEmail}`);
  console.log(`adminPassword=${adminPassword}`);
  console.log('facultyPassword=Faculty@123');
  console.log('studentPassword=password');
  console.log(`createdSubjects=${createdSubjects}`);
  console.log(`createdFaculty=${createdFaculty}`);
  console.log(`createdStudents=${createdStudents}`);
  console.log(`createdClasses=${createdClasses}`);
  console.log(`createdTimetables=${createdTimetables}`);
  console.log(`apiStats_students=${stats.stats.totalStudents}`);
  console.log(`apiStats_faculty=${stats.stats.totalFaculty}`);
  console.log(`apiStats_subjects=${stats.stats.totalSubjects}`);
  console.log(`apiStats_classes=${stats.stats.totalClasses}`);
  console.log(`apiClasses_listed=${classes.classes.length}`);
  console.log(`elapsedSeconds=${elapsedSec}`);
}

main().catch((error) => {
  console.error('MASS_SEED_FAILED', error.message);
  process.exit(1);
});
