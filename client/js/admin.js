let currentUser = null;
let classes = [];
let subjects = [];
let users = [];
let userChart = null;
let attendanceChart = null;
let subjectChart = null;
let timetableEntries = [];
let timetableFaculty = [];
const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_PERIODS_PER_DAY = 7;
const TIMETABLE_COLUMNS = [
    { type: 'period', period: 1, title: 'I', time: '08:05 AM - 08:55 AM' },
    { type: 'period', period: 2, title: 'II', time: '09:00 AM - 09:50 AM' },
    { type: 'break', label: 'BREAK' },
    { type: 'period', period: 3, title: 'III', time: '10:10 AM - 11:05 AM' },
    { type: 'period', period: 4, title: 'IV', time: '11:05 AM - 12:00 Noon' },
    { type: 'break', label: 'LUNCH BREAK' },
    { type: 'period', period: 5, title: 'V', time: '01:00 PM - 01:50 PM' },
    { type: 'period', period: 6, title: 'VI', time: '01:50 PM - 02:40 PM' },
    { type: 'break', label: 'BREAK' },
    { type: 'period', period: 7, title: 'VII', time: '02:55 PM - 03:45 PM' }
];

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = checkAuth();
    if (!currentUser || currentUser.role !== 'admin') {
        return;
    }

    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    
    setupNavigation();
    setupLogoutHandler();
    setupUserMenu();
    await applyDashboardSettings();
    await loadOverviewData();
    await loadAnnouncements();
    enableDashboardCustomization();

    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');
    if (page) {
        const link = document.querySelector(`.nav-link[data-page="${page}"]`);
        if (link) {
            link.click();
        }
    }
});

async function applyDashboardSettings() {
    try {
        const settings = await api.get('/settings/dashboard');
        if (settings && settings.widgets) {
            for (const widgetId in settings.widgets) {
                const element = document.getElementById(widgetId);
                if (element) {
                    element.style.display = settings.widgets[widgetId] ? '' : 'none';
                }
            }
        }
    } catch (error) {
        console.error('Failed to apply dashboard settings:', error);
    }
}

function setupLogoutHandler() {
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });
    document.getElementById('logoutBtnDropdown').addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });
}

function setupUserMenu() {
    const userMenu = document.getElementById('userMenu');
    if (userMenu) {
        userMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('active');
        });
    }

    document.addEventListener('click', (e) => {
        const userMenu = document.getElementById('userMenu');
        if (userMenu && !userMenu.contains(e.target)) {
            userMenu.classList.remove('active');
        }
    });
}

async function handleLogout() {
    try {
        await api.post('/auth/logout');
    } catch (error) {
        console.log('Logout API call failed, proceeding with local logout');
    } finally {
        clearAuth();
        window.location.href = 'login.html';
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
}

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[data-page]');
    navLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            document.querySelectorAll('.page-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(page).classList.add('active');
            document.getElementById('pageTitle').textContent = link.textContent.trim();
            
            if (window.innerWidth < 769) {
                document.getElementById('sidebar').classList.remove('active');
            }
            
            await loadPageData(page);
        });
    });
}

async function loadPageData(page) {
    switch (page) {
        case 'overview':
            await loadOverviewData();
            break;
        case 'users':
            await loadUsers();
            break;
        case 'students':
            await loadStudents();
            break;
        case 'faculty':
            await loadFaculty();
            break;
        case 'subjects':
            await loadSubjects();
            break;
        case 'classes':
            await loadClasses();
            break;
        case 'timetable':
            await loadTimetableData();
            break;
        case 'reports':
            await loadReportData();
            break;
        case 'audit':
            loadAuditLogs();
            break;
        case 'security':
            await loadSecurityData();
            break;
    }
}

async function loadSecurityData() {
    await Promise.all([
        loadSecurityAttempts(),
        loadBlockedUsers()
    ]);
}

async function loadSecurityAttempts() {
    try {
        const data = await api.get('/security/attempts?limit=200');
        renderSecurityAttemptsTable(data.attempts || []);
    } catch (error) {
        console.error('Error loading security attempts:', error);
    }
}

function renderSecurityAttemptsTable(attempts) {
    const tbody = document.querySelector('#securityAttemptsTable tbody');
    if (!tbody) return;

    if (!attempts.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No suspicious attempts found</td></tr>';
        return;
    }

    tbody.innerHTML = attempts.map((a) => `
        <tr>
            <td>${formatAuditDate(a.attemptedAt)}</td>
            <td>${a.ipAddress || 'Unknown'}</td>
            <td>${a.routePath || '/api/auth/login'}</td>
            <td>${a.attemptedEmail || 'Unknown'}</td>
            <td>${a.attemptCount || 1}</td>
            <td class="details-cell" title="${(a.details || '').replace(/"/g, '&quot;')}">${a.details || '-'}</td>
            <td class="actions">
                ${a.user && !a.user.isBlocked
                    ? `<button class="btn btn-small btn-danger" onclick="blockUserFromSecurity('${a.user._id}')">Block User</button>
                       <button class="btn btn-small btn-secondary" onclick="resetUserPasswordFromSecurity('${a.user._id}')">Reset Password & Send Mail</button>`
                    : '<span style="color: var(--gray-500);">N/A</span>'}
            </td>
        </tr>
    `).join('');
}

async function loadBlockedUsers() {
    try {
        const data = await api.get('/security/blocked-users');
        renderBlockedUsersTable(data.users || []);
    } catch (error) {
        console.error('Error loading blocked users:', error);
    }
}

function renderBlockedUsersTable(users) {
    const tbody = document.querySelector('#blockedUsersTable tbody');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No blocked users</td></tr>';
        return;
    }

    tbody.innerHTML = users.map((u) => `
        <tr>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td><span class="badge badge-${u.role}">${u.role}</span></td>
            <td>${u.blockedAt ? formatAuditDate(u.blockedAt) : '-'}</td>
            <td>${u.blockedReason || '-'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="resetUserPasswordFromSecurity('${u._id}')">Reset Password & Send Mail</button>
                <button class="btn btn-small btn-success" onclick="unblockUserFromSecurity('${u._id}')">Unblock</button>
            </td>
        </tr>
    `).join('');
}

async function blockUserFromSecurity(userId) {
    const reason = prompt('Reason to block this user?', 'Suspicious login attempts detected');
    if (reason === null) return;

    try {
        await api.post('/security/block-user', { userId, reason });
        await loadSecurityData();
        alert('User blocked successfully.');
    } catch (error) {
        alert(error.message || 'Failed to block user');
    }
}

async function unblockUserFromSecurity(userId) {
    if (!confirm('Unblock this user?')) return;

    try {
        await api.post('/security/unblock-user', { userId });
        await loadSecurityData();
        alert('User unblocked successfully.');
    } catch (error) {
        alert(error.message || 'Failed to unblock user');
    }
}

async function resetUserPasswordFromSecurity(userId) {
    if (!confirm('Generate random password and send to this user email?')) return;

    try {
        const result = await api.post(`/auth/users/${userId}/reset-password-random`, {});
        if (result.tempPassword) {
            alert(`Password reset done. Email failed in local mode. Temporary password: ${result.tempPassword}`);
        } else {
            alert('Password reset and email sent successfully.');
        }
    } catch (error) {
        alert(error.message || 'Failed to reset password');
    }
}

async function findUserIdByEmail(email) {
    const trimmed = (email || '').trim().toLowerCase();
    if (!trimmed) {
        throw new Error('Please enter a user email');
    }

    const data = await api.get('/auth/users');
    const user = (data.users || []).find((u) => (u.email || '').toLowerCase() === trimmed);
    if (!user) {
        throw new Error('User not found for this email');
    }

    return user._id;
}

async function resetPasswordByEmail() {
    const emailEl = document.getElementById('securityUserEmail');
    const email = emailEl ? emailEl.value : '';

    try {
        const userId = await findUserIdByEmail(email);
        await resetUserPasswordFromSecurity(userId);
    } catch (error) {
        alert(error.message || 'Failed to reset password');
    }
}

async function unblockUserByEmail() {
    const emailEl = document.getElementById('securityUserEmail');
    const email = emailEl ? emailEl.value : '';

    try {
        const userId = await findUserIdByEmail(email);
        await unblockUserFromSecurity(userId);
    } catch (error) {
        alert(error.message || 'Failed to unblock user');
    }
}

async function loadOverviewData() {
    try {
        const [usersData, subjectsData, classesData] = await Promise.all([
            api.get('/auth/users'),
            api.get('/subjects'),
            api.get('/classes')
        ]);

        const students = usersData.users.filter(u => u.role === 'student');
        const faculty = usersData.users.filter(u => u.role === 'faculty');

        document.getElementById('totalStudents').textContent = students.length;
        document.getElementById('totalFaculty').textContent = faculty.length;
        document.getElementById('totalSubjects').textContent = subjectsData.subjects.length;
        document.getElementById('totalClasses').textContent = classesData.classes.length;

        renderUserDistributionChart(students.length, faculty.length);
        await renderAttendanceOverviewChart();
    } catch (error) {
        console.error('Error loading overview:', error);
    }
}

function renderUserDistributionChart(students, faculty) {
    const ctx = document.getElementById('userChart');
    if (!ctx) return;

    if (userChart) {
        userChart.destroy();
    }

    userChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Students', 'Faculty'],
            datasets: [{
                data: [students, faculty],
                backgroundColor: ['#4a90e2', '#50c878'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 10,
                        font: { size: 11 },
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

async function renderAttendanceOverviewChart() {
    const ctx = document.getElementById('attendanceChart');
    if (!ctx) return;

    try {
        const reportData = await api.get('/attendance/report');
        
        const studentAttendance = {};
        reportData.report.forEach(r => {
            if (!studentAttendance[r.studentName]) {
                studentAttendance[r.studentName] = { total: 0, present: 0 };
            }
            studentAttendance[r.studentName].total += r.totalClasses;
            studentAttendance[r.studentName].present += r.present;
        });

        const studentNames = Object.keys(studentAttendance).slice(0, 5);
        const attendancePercentages = studentNames.map(name => {
            const data = studentAttendance[name];
            return data.total > 0 ? ((data.present / data.total) * 100).toFixed(1) : 0;
        });

        if (attendanceChart) {
            attendanceChart.destroy();
        }

        attendanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: studentNames.length > 0 ? studentNames : ['No Data'],
                datasets: [{
                    label: 'Attendance %',
                    data: attendancePercentages.length > 0 ? attendancePercentages : [0],
                    backgroundColor: attendancePercentages.map(p => 
                        p < 75 ? '#e74c3c' : p < 85 ? '#f39c12' : '#27ae60'
                    ),
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: false
                        },
                        ticks: {
                            font: { size: 10 }
                        }
                    },
                    x: {
                        ticks: { font: { size: 10 } }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    } catch (error) {
        console.log('Attendance chart data not available yet');
    }
}

async function loadUsers() {
    try {
        const data = await api.get('/auth/users');
        users = data.users;
        renderUsersTable(users);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUsersTable(users) {
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td><span class="badge badge-${user.role}">${user.role}</span></td>
            <td>${user.assignedClass?.className || '-'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editUser('${user._id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteUser('${user._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadStudents() {
    try {
        const data = await api.get('/auth/users?role=student');
        users = data.users;
        renderStudentsTable(users);
    } catch (error) {
        console.error('Error loading students:', error);
    }
}

function renderStudentsTable(students) {
    const tbody = document.querySelector('#studentsTable tbody');
    tbody.innerHTML = students.map(student => `
        <tr>
            <td>${student.name}</td>
            <td>${student.uniqueId || 'N/A'}</td>
            <td>${student.email}</td>
            <td>${student.department || 'N/A'}</td>
            <td>${student.year || 'N/A'}</td>
            <td>${student.batch || 'N/A'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editStudent('${student._id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteUser('${student._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadFaculty() {
    try {
        const data = await api.get('/auth/users?role=faculty');
        users = data.users;
        renderFacultyTable(users);
    } catch (error) {
        console.error('Error loading faculty:', error);
    }
}

function renderFacultyTable(faculty) {
    const tbody = document.querySelector('#facultyTable tbody');
    tbody.innerHTML = faculty.map(f => `
        <tr>
            <td>${f.name}</td>
            <td>${f.email}</td>
            <td>${f.assignedSubjects?.map(s => s.subjectName).join(', ') || 'Not Assigned'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editFaculty('${f._id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteUser('${f._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadSubjects() {
    try {
        const data = await api.get('/subjects');
        subjects = data.subjects;
        renderSubjectsTable(subjects);
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

function renderSubjectsTable(subjects) {
    const tbody = document.querySelector('#subjectsTable tbody');
    tbody.innerHTML = subjects.map(subject => `
        <tr>
            <td>${subject.subjectName}</td>
            <td>${subject.subjectCode}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editSubject('${subject._id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteSubject('${subject._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadClasses() {
    try {
        const [classesData, subjectsData] = await Promise.all([
            api.get('/classes'),
            api.get('/subjects')
        ]);
        classes = classesData.classes;
        subjects = subjectsData.subjects;
        renderClassesTable(classes);
    } catch (error) {
        console.error('Error loading classes:', error);
    }
}

function renderClassesTable(classes) {
    const tbody = document.querySelector('#classesTable tbody');
    tbody.innerHTML = classes.map(c => `
        <tr>
            <td>${c.className}</td>
            <td>${c.students?.length || 0}</td>
            <td>${c.assignedSubjects?.map(s => s.subjectName).join(', ') || 'None'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editClass('${c._id}')">Edit</button>
                <button class="btn btn-small btn-primary" onclick="manageClassStudents('${c._id}')">Students</button>
                <button class="btn btn-small btn-danger" onclick="deleteClass('${c._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadTimetableData() {
    try {
        const [classesData, subjectsData, usersData] = await Promise.all([
            api.get('/classes'),
            api.get('/subjects'),
            api.get('/auth/users?role=faculty')
        ]);
        classes = classesData.classes;
        subjects = subjectsData.subjects;
        timetableFaculty = usersData.users || [];

        const classSelect = document.getElementById('timetableClassFilter');
        classSelect.innerHTML = '<option value="">Select Class</option>' +
            classes.map(c => `<option value="${c._id}">${c.className}</option>`).join('');

        timetableEntries = [];
        renderTimetableGrid([]);
    } catch (error) {
        console.error('Error loading timetable data:', error);
    }
}

async function loadTimetable() {
    const classId = document.getElementById('timetableClassFilter').value;
    if (!classId) {
        alert('Please select a class');
        return;
    }

    try {
        const data = await api.get(`/timetable?classId=${classId}`);
        timetableEntries = data.timetables || [];
        renderTimetableGrid(timetableEntries);
    } catch (error) {
        console.error('Error loading timetable:', error);
    }
}

function renderTimetableGrid(timetables) {
    const table = document.getElementById('weeklyTimetableGrid');
    const thead = table.querySelector('thead');
    const tbody = document.querySelector('#weeklyTimetableGrid tbody');
    const classId = document.getElementById('timetableClassFilter').value;
    const classMeta = document.getElementById('timetableClassMeta');

    if (thead) {
        const headerCells = TIMETABLE_COLUMNS.map((col) => {
            if (col.type === 'break') {
                return `<th class="slot-head break-head">${col.label}</th>`;
            }

            return `<th class="slot-head"><div class="head-period">${col.title}</div><div class="head-time">${col.time}</div></th>`;
        }).join('');

        thead.innerHTML = `
            <tr>
                <th class="day-head">Day / Hour</th>
                ${headerCells}
            </tr>
        `;
    }

    const selectedClass = classes.find((c) => c._id === classId);
    if (classMeta) {
        classMeta.textContent = selectedClass
            ? `${selectedClass.className} | ${selectedClass.department || '-'} | Year ${selectedClass.year || '-'} | Batch ${selectedClass.batch || '-'}`
            : 'Select a class to load weekly timetable.';
    }

    if (!classId) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">Please select a class</td></tr>';
        return;
    }

    const list = timetables || [];
    const maxPeriod = MAX_PERIODS_PER_DAY;
    const slotMap = new Map();

    list.forEach((entry) => {
        slotMap.set(`${entry.day}-${entry.period}`, entry);
    });

    const rows = TIMETABLE_DAYS.map((day) => {
        const cells = TIMETABLE_COLUMNS.map((col) => {
            if (col.type === 'break') {
                return `<td class="timetable-slot break-cell">${col.label}</td>`;
            }

            const entry = slotMap.get(`${day}-${col.period}`);
            if (!entry) {
                return `
                    <td class="timetable-slot empty-slot">
                        <button class="btn btn-small btn-secondary timetable-cell-action" onclick="showAddTimetableModal({ classId: '${classId}', day: '${day}', period: ${col.period} })">+ Add</button>
                    </td>
                `;
            }

            return `
                <td class="timetable-slot filled-slot">
                    <div class="slot-subject">${entry.subject?.subjectCode ? `${entry.subject.subjectCode} - ` : ''}${entry.subject?.subjectName || 'N/A'}</div>
                    <div class="slot-faculty"><strong>Faculty:</strong> ${entry.faculty?.name || 'N/A'}</div>
                    <div class="slot-room">${entry.roomNo ? `Room: ${entry.roomNo}` : 'Room: N/A'}</div>
                    <div class="slot-actions">
                        <button class="btn btn-small btn-secondary timetable-cell-action" onclick="showEditTimetableModal('${entry._id}')">Edit</button>
                    </div>
                </td>
            `;
        }).join('');

        return `
            <tr>
                <td class="day-cell">${day}</td>
                ${cells}
            </tr>
        `;
    });

    tbody.innerHTML = rows.join('');
}

function buildTimetableFormMarkup({ mode = 'add', entry = null, classId = '', day = '', period = '' }) {
    const submitLabel = mode === 'edit' ? 'Update Entry' : 'Add Entry';
    const defaultClass = classId || entry?.class?._id || '';
    const defaultDept = entry?.department || '';
    const defaultYear = entry?.year || '';
    const defaultBatch = entry?.batch || '';
    const defaultSubject = entry?.subject?._id || '';
    const defaultFaculty = entry?.faculty?._id || '';
    const defaultDay = day || entry?.day || '';
    const defaultPeriod = period || entry?.period || '';
    const defaultRoom = entry?.roomNo || '';

    return `
        <form id="timetableForm">
            <div id="modalTimetableError" class="error-message" style="display:none;"></div>
            <div class="form-row">
                <div class="form-group">
                    <label>Class *</label>
                    <select id="modalTimetableClass" required onchange="updateTimetableClassInfo()">
                        <option value="">Select Class</option>
                        ${classes.map((c) => `<option value="${c._id}" data-dept="${c.department || ''}" data-year="${c.year || ''}" data-batch="${c.batch || ''}" ${c._id === defaultClass ? 'selected' : ''}>${c.className} - ${c.department || '-'} Year ${c.year || '-'}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Department *</label>
                    <input type="text" id="modalTimetableDept" required readonly value="${defaultDept}">
                </div>
                <div class="form-group">
                    <label>Year *</label>
                    <input type="number" id="modalTimetableYear" required readonly value="${defaultYear}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Batch</label>
                    <input type="text" id="modalTimetableBatch" readonly value="${defaultBatch}">
                </div>
                <div class="form-group">
                    <label>Room No.</label>
                    <input type="text" id="modalTimetableRoom" placeholder="e.g., Room 101" value="${defaultRoom}">
                </div>
            </div>
            <div class="form-group">
                <label>Subject *</label>
                <select id="modalTimetableSubject" required>
                    <option value="">Select Subject</option>
                    ${subjects.map((s) => `<option value="${s._id}" ${s._id === defaultSubject ? 'selected' : ''}>${s.subjectName}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Faculty *</label>
                <select id="modalTimetableFaculty" required>
                    <option value="">Select Faculty</option>
                    ${timetableFaculty.map((f) => `<option value="${f._id}" ${f._id === defaultFaculty ? 'selected' : ''}>${f.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Day *</label>
                    <select id="modalTimetableDay" required>
                        <option value="">Select Day</option>
                        ${TIMETABLE_DAYS.map((d) => `<option value="${d}" ${d === defaultDay ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Period *</label>
                    <select id="modalTimetablePeriod" required>
                        <option value="">Select Period</option>
                        ${TIMETABLE_COLUMNS
                            .filter((col) => col.type === 'period')
                            .map((col) => `<option value="${col.period}" ${Number(defaultPeriod) === col.period ? 'selected' : ''}>Period ${col.title} (${col.time})</option>`)
                            .join('')}
                    </select>
                </div>
            </div>
            <button type="submit" class="btn btn-primary btn-block">${submitLabel}</button>
            ${mode === 'edit' && entry ? `<button type="button" class="btn btn-danger btn-block" style="margin-top:10px;" onclick="deleteTimetable('${entry._id}', true)">Delete Entry</button>` : ''}
        </form>
    `;
}

function showTimetableFormError(message) {
    const errorEl = document.getElementById('modalTimetableError');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function attachTimetableFormSubmit(mode = 'add', entryId = null) {
    const form = document.getElementById('timetableForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            classId: document.getElementById('modalTimetableClass').value,
            department: document.getElementById('modalTimetableDept').value,
            year: parseInt(document.getElementById('modalTimetableYear').value, 10),
            batch: document.getElementById('modalTimetableBatch').value,
            subjectId: document.getElementById('modalTimetableSubject').value,
            facultyId: document.getElementById('modalTimetableFaculty').value,
            day: document.getElementById('modalTimetableDay').value,
            period: parseInt(document.getElementById('modalTimetablePeriod').value, 10),
            roomNo: document.getElementById('modalTimetableRoom').value
        };

        try {
            if (mode === 'edit' && entryId) {
                await api.put(`/timetable/${entryId}`, payload);
            } else {
                await api.post('/timetable', payload);
            }

            closeModal();

            const filter = document.getElementById('timetableClassFilter');
            if (!filter.value) {
                filter.value = payload.classId;
            }
            await loadTimetable();
        } catch (error) {
            if ((error.message || '').toLowerCase().includes('already exists')) {
                showTimetableFormError('That class already has a timetable entry for the selected day and period. Choose another slot.');
                return;
            }
            showTimetableFormError(error.message || 'Failed to save timetable entry');
        }
    });
}

function getTimetableEntryById(entryId) {
    return timetableEntries.find((entry) => entry._id === entryId);
}

async function showAddTimetableModal(preset = {}) {
    try {
        if (!classes.length || !subjects.length || !timetableFaculty.length) {
            await loadTimetableData();
        }

        document.getElementById('modalTitle').textContent = 'Add Timetable Entry';
        document.getElementById('modalBody').innerHTML = buildTimetableFormMarkup({
            mode: 'add',
            classId: preset.classId || document.getElementById('timetableClassFilter').value,
            day: preset.day || '',
            period: preset.period || ''
        });

        updateTimetableClassInfo();
        attachTimetableFormSubmit('add', null);
        document.getElementById('modal').classList.add('active');
    } catch (error) {
        console.error('Error loading timetable form data:', error);
    }
}

async function showEditTimetableModal(entryId) {
    try {
        if (!classes.length || !subjects.length || !timetableFaculty.length) {
            await loadTimetableData();
        }

        const entry = getTimetableEntryById(entryId);
        if (!entry) {
            alert('Timetable entry not found. Reload timetable and try again.');
            return;
        }

        document.getElementById('modalTitle').textContent = 'Edit Timetable Entry';
        document.getElementById('modalBody').innerHTML = buildTimetableFormMarkup({
            mode: 'edit',
            entry
        });

        updateTimetableClassInfo();
        attachTimetableFormSubmit('edit', entryId);
        document.getElementById('modal').classList.add('active');
    } catch (error) {
        console.error('Error opening edit timetable modal:', error);
    }
}

async function loadReportData() {
    try {
        const [classesData, subjectsData] = await Promise.all([
            api.get('/classes'),
            api.get('/subjects')
        ]);
        classes = classesData.classes;
        subjects = subjectsData.subjects;

        const reportClass = document.getElementById('reportClass');
        const reportSubject = document.getElementById('reportSubject');
        
        reportClass.innerHTML = '<option value="">Select Class</option>' +
            classes.map(c => `<option value="${c._id}">${c.className}</option>`).join('');
        
        reportSubject.innerHTML = '<option value="">Select Subject</option>' +
            subjects.map(s => `<option value="${s._id}">${s.subjectName}</option>`).join('');

        await loadAttendanceAnomalies();
    } catch (error) {
        console.error('Error loading report data:', error);
    }
}

async function loadAttendanceAnomalies() {
    try {
        const data = await api.get('/analytics/anomalies');
        renderAnomaliesTable(data.anomalies || []);
    } catch (error) {
        console.error('Error loading attendance anomalies:', error);
    }
}

function renderAnomaliesTable(anomalies) {
    const tbody = document.querySelector('#anomaliesTable tbody');
    if (!tbody) return;

    if (!anomalies.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No anomalies detected</td></tr>';
        return;
    }

    tbody.innerHTML = anomalies.map((a) => `
        <tr>
            <td>${formatAuditDate(a.when)}</td>
            <td>${a.type}</td>
            <td><span class="status-badge status-${(a.severity || 'low').toLowerCase()}">${a.severity || 'low'}</span></td>
            <td>${a.summary || '-'}</td>
            <td class="details-cell" title="${(a.details || '').replace(/"/g, '&quot;')}">${a.details || '-'}</td>
        </tr>
    `).join('');
}

async function loadReport() {
    const classId = document.getElementById('reportClass').value;
    const subjectId = document.getElementById('reportSubject').value;
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;

    let url = '/attendance/report?';
    if (classId) url += `classId=${classId}&`;
    if (subjectId) url += `subjectId=${subjectId}&`;
    if (startDate) url += `startDate=${startDate}&`;
    if (endDate) url += `endDate=${endDate}`;

    try {
        const data = await api.get(url);
        renderReportTable(data.report);
        renderSubjectChart(data.report);
    } catch (error) {
        console.error('Error loading report:', error);
    }
}

function renderSubjectChart(report) {
    const ctx = document.getElementById('subjectAttendanceChart');
    if (!ctx) return;

    const subjectData = {};
    report.forEach(r => {
        if (!subjectData[r.subjectName]) {
            subjectData[r.subjectName] = { total: 0, present: 0 };
        }
        subjectData[r.subjectName].total += r.totalClasses;
        subjectData[r.subjectName].present += r.present;
    });

    const subjectNames = Object.keys(subjectData);
    const percentages = subjectNames.map(name => {
        const data = subjectData[name];
        return data.total > 0 ? ((data.present / data.total) * 100).toFixed(1) : 0;
    });

    if (subjectChart) {
        subjectChart.destroy();
    }

    subjectChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: subjectNames.length > 0 ? subjectNames : ['No Data'],
            datasets: [{
                label: 'Attendance %',
                data: percentages.length > 0 ? percentages : [0],
                backgroundColor: percentages.map(p => 
                    p < 75 ? '#e74c3c' : p < 85 ? '#f39c12' : '#27ae60'
                ),
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: false
                    },
                    ticks: {
                        font: { size: 10 }
                    }
                },
                y: {
                    ticks: { font: { size: 10 } }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function renderReportTable(report) {
    const tbody = document.querySelector('#reportTable tbody');
    if (report.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No data found</td></tr>';
        return;
    }

    tbody.innerHTML = report.map(r => `
        <tr>
            <td>${r.studentName}</td>
            <td>${r.subjectName} (${r.subjectCode})</td>
            <td>${r.totalClasses}</td>
            <td>${r.present}</td>
            <td class="${r.attendancePercentage < 75 ? 'text-danger' : 'text-success'}">${r.attendancePercentage}%</td>
        </tr>
    `).join('');
}

function exportReport() {
    const classId = document.getElementById('reportClass').value;
    const subjectId = document.getElementById('reportSubject').value;
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;

    const token = localStorage.getItem('token');
    let url = `/api/attendance/export?`;
    if (classId) url += `classId=${classId}&`;
    if (subjectId) url += `subjectId=${subjectId}&`;
    if (startDate) url += `startDate=${startDate}&`;
    if (endDate) url += `endDate=${endDate}`;

    fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    })
    .catch(error => {
        console.error('Error exporting report:', error);
        alert('Error exporting report');
    });
}

// Modal Functions
function showAddUserModal() {
    document.getElementById('modalTitle').textContent = 'Add User';
    document.getElementById('modalBody').innerHTML = `
        <form id="addUserForm">
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="modalName" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="modalEmail" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="modalPassword" required>
            </div>
            <div class="form-group">
                <label>Role</label>
                <select id="modalRole" required>
                    <option value="">Select Role</option>
                    <option value="admin">Admin</option>
                    <option value="faculty">Faculty</option>
                    <option value="student">Student</option>
                </select>
            </div>
            <div class="form-group" id="classSelectGroup" style="display:none;">
                <label>Class</label>
                <select id="modalClass"></select>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Add User</button>
        </form>
    `;
    
    document.getElementById('modalRole').addEventListener('change', (e) => {
        const classGroup = document.getElementById('classSelectGroup');
        if (e.target.value === 'student') {
            classGroup.style.display = 'block';
            loadClassesForSelect();
        } else {
            classGroup.style.display = 'none';
        }
    });

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addUser();
    });

    document.getElementById('modal').classList.add('active');
}

async function loadClassesForSelect() {
    try {
        const data = await api.get('/classes');
        document.getElementById('modalClass').innerHTML = 
            '<option value="">Select Class</option>' +
            data.classes.map(c => `<option value="${c._id}">${c.className}</option>`).join('');
    } catch (error) {
        console.error('Error loading classes:', error);
    }
}

async function addUser() {
    const name = document.getElementById('modalName').value;
    const email = document.getElementById('modalEmail').value;
    const password = document.getElementById('modalPassword').value;
    const role = document.getElementById('modalRole').value;
    const assignedClass = document.getElementById('modalClass').value || null;

    try {
        await api.post('/auth/register', { name, email, password, role, assignedClass });
        closeModal();
        await loadUsers();
        await loadOverviewData();
    } catch (error) {
        alert(error.message);
    }
}

async function editUser(userId) {
    const user = users.find(u => u._id === userId);
    if (!user) return;

    document.getElementById('modalTitle').textContent = 'Edit User';
    document.getElementById('modalBody').innerHTML = `
        <form id="editUserForm">
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="modalName" value="${user.name}" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="modalEmail" value="${user.email}" required>
            </div>
            <div class="form-group">
                <label>New Password (leave blank to keep current)</label>
                <input type="password" id="modalPassword">
            </div>
            <button type="submit" class="btn btn-primary btn-block">Update User</button>
        </form>
    `;

    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateUser(userId);
    });

    document.getElementById('modal').classList.add('active');
}

async function updateUser(userId) {
    const name = document.getElementById('modalName').value;
    const email = document.getElementById('modalEmail').value;
    const password = document.getElementById('modalPassword').value;

    const data = { name, email };
    if (password) data.password = password;

    try {
        await api.put(`/auth/users/${userId}`, data);
        closeModal();
        await loadUsers();
    } catch (error) {
        alert(error.message);
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
        await api.delete(`/auth/users/${userId}`);
        await loadUsers();
        await loadOverviewData();
    } catch (error) {
        alert(error.message);
    }
}

function showAddStudentModal() {
    showAddUserModal();
}

function editStudent(studentId) {
    editUser(studentId);
}

function showAddFacultyModal() {
      document.getElementById('modalTitle').textContent = 'Add Faculty';
      document.getElementById('modalBody').innerHTML = `
          <form id="addFacultyForm">
              <div class="form-group">
                  <label>Name</label>
                  <input type="text" id="modalFacultyName" required>
              </div>
              <div class="form-group">
                  <label>Email</label>
                  <input type="email" id="modalFacultyEmail" required>
              </div>
              <div class="form-group">
                  <label>Department</label>
                  <input type="text" id="modalFacultyDepartment" required>
              </div>
              <div class="form-group">
                  <label>Faculty ID</label>
                  <input type="text" id="modalFacultyId" required>
              </div>
              <div class="form-group">
                  <label>Password</label>
                  <input type="password" id="modalFacultyPassword" required>
              </div>
              <button type="submit" class="btn btn-primary btn-block">Add Faculty</button>
          </form>
      `;

      document.getElementById('modal').classList.add('active');

      document.getElementById('addFacultyForm').onsubmit = async (e) => {
          e.preventDefault();
          const name = document.getElementById('modalFacultyName').value;
          const email = document.getElementById('modalFacultyEmail').value;
          const department = document.getElementById('modalFacultyDepartment').value;
          const uniqueId = document.getElementById('modalFacultyId').value;
          const password = document.getElementById('modalFacultyPassword').value;
          
          try {
              await api.post('/auth/register', { 
                  name, 
                  email, 
                  password, 
                  role: 'faculty',
                  department,
                  uniqueId
              });
              closeModal();
              loadFaculty(); 
          } catch (error) {
              alert(error.message); } };
}

  function editFaculty(facultyId) {
    editUser(facultyId);
}

function showAddSubjectModal() {
    document.getElementById('modalTitle').textContent = 'Add Subject';
    document.getElementById('modalBody').innerHTML = `
        <form id="addSubjectForm">
            <div class="form-group">
                <label>Subject Name</label>
                <input type="text" id="modalSubjectName" required>
            </div>
            <div class="form-group">
                <label>Subject Code</label>
                <input type="text" id="modalSubjectCode" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Add Subject</button>
        </form>
    `;

    document.getElementById('addSubjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const subjectName = document.getElementById('modalSubjectName').value;
        const subjectCode = document.getElementById('modalSubjectCode').value;

        try {
            await api.post('/subjects', { subjectName, subjectCode });
            closeModal();
            await loadSubjects();
            await loadOverviewData();
        } catch (error) {
            alert(error.message);
        }
    });

    document.getElementById('modal').classList.add('active');
}

async function editSubject(subjectId) {
    const subject = subjects.find(s => s._id === subjectId);
    if (!subject) return;

    document.getElementById('modalTitle').textContent = 'Edit Subject';
    document.getElementById('modalBody').innerHTML = `
        <form id="editSubjectForm">
            <div class="form-group">
                <label>Subject Name</label>
                <input type="text" id="modalSubjectName" value="${subject.subjectName}" required>
            </div>
            <div class="form-group">
                <label>Subject Code</label>
                <input type="text" id="modalSubjectCode" value="${subject.subjectCode}" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Update Subject</button>
        </form>
    `;

    document.getElementById('editSubjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.put(`/subjects/${subjectId}`, {
                subjectName: document.getElementById('modalSubjectName').value,
                subjectCode: document.getElementById('modalSubjectCode').value
            });
            closeModal();
            await loadSubjects();
        } catch (error) {
            alert(error.message);
        }
    });

    document.getElementById('modal').classList.add('active');
}

async function deleteSubject(subjectId) {
    if (!confirm('Are you sure you want to delete this subject?')) return;

    try {
        await api.delete(`/subjects/${subjectId}`);
        await loadSubjects();
        await loadOverviewData();
    } catch (error) {
        alert(error.message);
    }
}

function showAddClassModal() {
    document.getElementById('modalTitle').textContent = 'Add Class';
    document.getElementById('modalBody').innerHTML = `
        <form id="addClassForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Class Name *</label>
                    <input type="text" id="modalClassName" required placeholder="e.g., CSE A">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Department *</label>
                    <select id="modalClassDept" required>
                        <option value="">Select Department</option>
                        <option value="CSE">CSE - Computer Science</option>
                        <option value="ECE">ECE - Electronics</option>
                        <option value="EEE">EEE - Electrical</option>
                        <option value="MECH">MECH - Mechanical</option>
                        <option value="CIVIL">CIVIL - Civil</option>
                        <option value="IT">IT - Information Technology</option>
                        <option value="MCA">MCA - Computer Application</option>
                        <option value="MBA">MBA - Business Admin</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Year *</label>
                    <select id="modalClassYear" required>
                        <option value="">Select Year</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Batch</label>
                    <select id="modalClassBatch">
                        <option value="">No Batch</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Subjects</label>
                <select id="modalSubjects" multiple style="height: 120px;">
                    ${subjects.map(s => `<option value="${s._id}">${s.subjectName}</option>`).join('')}
                </select>
                <small>Hold Ctrl/Cmd to select multiple</small>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Add Class</button>
        </form>
    `;

    document.getElementById('addClassForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const className = document.getElementById('modalClassName').value;
        const department = document.getElementById('modalClassDept').value;
        const year = document.getElementById('modalClassYear').value;
        const batch = document.getElementById('modalClassBatch').value;
        const selectedSubjects = Array.from(document.getElementById('modalSubjects').selectedOptions)
            .map(opt => opt.value);

        try {
            await api.post('/classes', { 
                className, 
                department, 
                year: parseInt(year),
                batch,
                assignedSubjectIds: selectedSubjects 
            });
            closeModal();
            await loadClasses();
            await loadOverviewData();
        } catch (error) {
            alert(error.message);
        }
    });

    document.getElementById('modal').classList.add('active');
}

async function editClass(classId) {
    const cls = classes.find(c => c._id === classId);
    if (!cls) return;

    document.getElementById('modalTitle').textContent = 'Edit Class';
    document.getElementById('modalBody').innerHTML = `
        <form id="editClassForm">
            <div class="form-group">
                <label>Class Name</label>
                <input type="text" id="modalClassName" value="${cls.className}" required>
            </div>
            <div class="form-group">
                <label>Subjects</label>
                <select id="modalSubjects" multiple style="height: 120px;">
                    ${subjects.map(s => `
                        <option value="${s._id}" ${cls.assignedSubjects?.some(cs => cs._id === s._id) ? 'selected' : ''}>
                            ${s.subjectName}
                        </option>
                    `).join('')}
                </select>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Update Class</button>
        </form>
    `;

    document.getElementById('editClassForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const className = document.getElementById('modalClassName').value;
        const selectedSubjects = Array.from(document.getElementById('modalSubjects').selectedOptions)
            .map(opt => opt.value);

        try {
            await api.put(`/classes/${classId}`, { className, assignedSubjectIds: selectedSubjects });
            closeModal();
            await loadClasses();
        } catch (error) {
            alert(error.message);
        }
    });

    document.getElementById('modal').classList.add('active');
}

async function manageClassStudents(classId) {
    const cls = classes.find(c => c._id === classId);
    if (!cls) return;

    try {
        const studentsData = await api.get('/auth/users?role=student');
        const allStudents = studentsData.users;
        const assignedStudentIds = cls.students?.map(s => s._id || s) || [];

        document.getElementById('modalTitle').textContent = `Manage Students - ${cls.className}`;
        document.getElementById('modalBody').innerHTML = `
            <form id="manageStudentsForm">
                <div class="form-group">
                    <label>Select Students</label>
                    <select id="modalStudents" multiple style="height: 200px;">
                        ${allStudents.map(s => `
                            <option value="${s._id}" ${assignedStudentIds.includes(s._id) ? 'selected' : ''}>
                                ${s.name} (${s.email})
                            </option>
                        `).join('')}
                    </select>
                    <small>Hold Ctrl/Cmd to select multiple</small>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Update Students</button>
            </form>
        `;

        document.getElementById('manageStudentsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedStudents = Array.from(document.getElementById('modalStudents').selectedOptions)
                .map(opt => opt.value);

            try {
                await api.put(`/classes/${classId}`, { studentIds: selectedStudents });
                closeModal();
                await loadClasses();
                await loadOverviewData();
            } catch (error) {
                alert(error.message);
            }
        });

        document.getElementById('modal').classList.add('active');
    } catch (error) {
        console.error('Error loading students:', error);
    }
}

async function deleteClass(classId) {
    if (!confirm('Are you sure you want to delete this class?')) return;

    try {
        await api.delete(`/classes/${classId}`);
        await loadClasses();
        await loadOverviewData();
    } catch (error) {
        alert(error.message);
    }
}

function updateTimetableClassInfo() {
    const classSelect = document.getElementById('modalTimetableClass');
    if (!classSelect) return;
    const selectedOption = classSelect.options[classSelect.selectedIndex];
    
    if (selectedOption.value) {
        document.getElementById('modalTimetableDept').value = selectedOption.dataset.dept || '';
        document.getElementById('modalTimetableYear').value = selectedOption.dataset.year || '';
        document.getElementById('modalTimetableBatch').value = selectedOption.dataset.batch || '';
    } else {
        document.getElementById('modalTimetableDept').value = '';
        document.getElementById('modalTimetableYear').value = '';
        document.getElementById('modalTimetableBatch').value = '';
    }
}

async function deleteTimetable(timetableId, closeAfterDelete = false) {
    if (!confirm('Are you sure you want to delete this timetable entry?')) return;

    try {
        await api.delete(`/timetable/${timetableId}`);
        if (closeAfterDelete) {
            closeModal();
        }
        await loadTimetable();
    } catch (error) {
        alert(error.message);
    }
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModal();
    }
});

// Audit Log Functions
let auditPage = 1;
const auditLimit = 20;

async function loadAuditLogs(page = 1) {
    auditPage = page;
    const action = document.getElementById('auditActionFilter').value;
    const startDate = document.getElementById('auditStartDate').value;
    const endDate = document.getElementById('auditEndDate').value;

    let url = `/audit?page=${page}&limit=${auditLimit}`;
    if (action) url += `&action=${action}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;

    try {
        const data = await api.get(url);
        renderAuditTable(data.logs);
        renderAuditPagination(data.pagination);
        loadAuditStats();
    } catch (error) {
        console.error('Error loading audit logs:', error);
    }
}

async function loadAuditStats() {
    try {
        const stats = await api.get('/audit/stats');
        document.getElementById('todayLogs').textContent = stats.todayLogs;
        document.getElementById('weekLogs').textContent = stats.weekLogs;
    } catch (error) {
        console.error('Error loading audit stats:', error);
    }
}

function renderAuditTable(logs) {
    const tbody = document.querySelector('#auditTable tbody');
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No audit logs found</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>${formatAuditDate(log.timestamp)}</td>
            <td>${log.userName || 'System'}</td>
            <td><span class="badge badge-${log.userRole}">${log.userRole}</span></td>
            <td><span class="action-badge action-${log.action.toLowerCase()}">${formatAction(log.action)}</span></td>
            <td class="details-cell" title="${log.details}">${log.details}</td>
            <td>${log.ipAddress}</td>
            <td><span class="status-badge status-${log.status.toLowerCase()}">${log.status}</span></td>
        </tr>
    `).join('');
}

function formatAuditDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatAction(action) {
    const actionMap = {
        'LOGIN': 'Login',
        'LOGOUT': 'Logout',
        'LOGIN_FAILED': 'Login Failed',
        'MARK_ATTENDANCE': 'Mark Attendance',
        'UPDATE_ATTENDANCE': 'Update Attendance',
        'CREATE': 'Create',
        'UPDATE': 'Update',
        'DELETE': 'Delete'
    };
    return actionMap[action] || action;
}

function renderAuditPagination(pagination) {
    const container = document.getElementById('auditPagination');
    if (pagination.pages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    if (pagination.page > 1) {
        html += `<button class="btn btn-small btn-secondary" onclick="loadAuditLogs(${pagination.page - 1})">Previous</button>`;
    }
    html += `<span class="page-info">Page ${pagination.page} of ${pagination.pages}</span>`;
    if (pagination.page < pagination.pages) {
        html += `<button class="btn btn-small btn-secondary" onclick="loadAuditLogs(${pagination.page + 1})">Next</button>`;
    }
    container.innerHTML = html;
}

function resetAuditFilters() {
    document.getElementById('auditActionFilter').value = '';
    document.getElementById('auditStartDate').value = '';
    document.getElementById('auditEndDate').value = '';
    loadAuditLogs(1);
}

const originalLoadPageData = loadPageData;
loadPageData = async function(page) {
    await originalLoadPageData(page);
    if (page === 'audit') {
        loadAuditLogs(1);
    }
    if (page === 'security') {
        loadSecurityData();
    }
};

// Dashboard Customization
function enableDashboardCustomization() {
    const grid = document.querySelector('.stats-grid');
    if (!grid) return;

    // Make items draggable
    // Simple drag and drop logic
    let draggedItem = null;

    grid.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('stat-card')) {
            draggedItem = e.target;
            setTimeout(() => {
                e.target.style.opacity = '0.5';
            }, 0);
        }
    });

    grid.addEventListener('dragend', (e) => {
        if (draggedItem) {
            setTimeout(() => {
                draggedItem.style.opacity = '1';
                draggedItem = null;
                saveWidgetOrder();
            }, 0);
        }
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(grid, e.clientY);
        if (afterElement == null) {
            grid.appendChild(draggedItem);
        } else {
            grid.insertBefore(draggedItem, afterElement);
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.stat-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveWidgetOrder() {
    const grid = document.querySelector('.stats-grid');
    const widgetOrder = [...grid.querySelectorAll('.stat-card')].map(card => card.id);
    try {
        await api.put('/user/dashboard-settings', { widgetOrder });
    } catch (error) {
        console.error('Failed to save widget order:', error);
    }
}

async function applyDashboardSettings() {
    const user = await getCurrentUser(true); // Force refresh
    const settings = user.dashboardSettings || {};
    
    if (settings.widgetOrder) {
        const grid = document.querySelector('.stats-grid');
        const widgets = new Map();
        grid.querySelectorAll('.stat-card').forEach(widget => {
            widgets.set(widget.id, widget);
        });

        // Remove all widgets
        while (grid.firstChild) {
            grid.removeChild(grid.firstChild);
        }

        // Append in saved order
        settings.widgetOrder.forEach(widgetId => {
            if (widgets.has(widgetId)) {
                grid.appendChild(widgets.get(widgetId));
            }
        });
    }
}

async function loadAnnouncements() {
    try {
        const response = await api.get('/announcements');
        const banner = document.getElementById('announcementBanner');
        if (banner) {
            if (response.announcements && response.announcements.length > 0) {
                banner.innerHTML = response.announcements.map(ann => `
                    <div class="announcement">
                        <h4>${ann.title}</h4>
                        <p>${ann.content}</p>
                        <div class="announcement-meta">
                            Posted by ${ann.createdBy?.name || 'Unknown'} on ${new Date(ann.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                `).join('');
                banner.style.display = 'block';
            } else {
                banner.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Failed to load announcements:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadOverviewData();
    await loadAnnouncements();
    await applyDashboardSettings();
    enableDashboardCustomization();
});






