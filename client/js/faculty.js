let currentUser = null;
let classes = [];
let subjects = [];
let students = [];
let selectedAttendanceData = [];
let groupedAttendanceHistory = [];
let weeklyClassesChart = null;
let attendanceOverviewChart = null;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = checkAuth();
    if (!currentUser || currentUser.role !== 'faculty') {
        return;
    }

    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('attendanceDate').value = getTodayDate();
    
    setupNavigation();
    setupLogoutHandler();
    setupUserMenu();
    setupDaySelector();
    await applyDashboardSettings();
    await loadInitialData();
    await loadAnnouncements();
    await loadTodaySchedule();

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

function initFacultyCalendar() {
    // Calendar functionality placeholder
    console.log('Faculty calendar initialized');
}

function setupLogoutHandler() {
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });
    const logoutBtn = document.getElementById('logoutBtnDropdown');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLogout();
        });
    }
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

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => document.body.removeChild(toast), 500);
        }, 3000);
    }, 100);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
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

function setupDaySelector() {
    const dayButtons = document.querySelectorAll('.day-btn');
    dayButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            dayButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadFacultyTimetable(btn.dataset.day);
        });
    });
}

async function loadPageData(page) {
    switch (page) {
        case 'overview':
            await loadOverviewData();
            break;
        case 'timetable':
            await loadTodayTimetable();
            break;
        case 'mark':
            await loadAttendanceFormData();
            break;
        case 'history':
            await loadHistoryFilters();
            break;
        case 'qrcode':
            await loadQRFormData();
            break;
        case 'analytics':
            await loadAnalyticsFilters();
            break;
        case 'leaves':
            await loadLeaveRequests();
            break;
    }
}

async function loadInitialData() {
    try {
        const [profileData, todayData, weekData] = await Promise.all([
            api.get('/auth/profile'),
            api.get('/timetable/faculty/today'),
            api.get('/timetable')
        ]);

        currentUser = profileData.user;
        document.getElementById('userName').textContent = currentUser.name;
        
        let uniqueSubjectsMap = new Map();
        if (weekData && weekData.timetables) {
            weekData.timetables.filter(t => t.faculty && t.faculty._id === currentUser._id).forEach(t => {
                if (t.subject && t.subject._id) {
                    uniqueSubjectsMap.set(t.subject._id, t.subject);
                }
            });
        }
        
        if (!currentUser.assignedSubjects || currentUser.assignedSubjects.length === 0) {
            currentUser.assignedSubjects = Array.from(uniqueSubjectsMap.values());
        }

        document.getElementById('assignedSubjects').textContent = currentUser.assignedSubjects ? currentUser.assignedSubjects.length : 0;
        
        const schedule = (todayData && todayData.schedule) ? todayData.schedule : (todayData && todayData.timetables) ? todayData.timetables : [];
        document.getElementById('todayPeriods').textContent = schedule.length;

        renderTodayTimetable(schedule);
    } catch (error) {
        console.error('Error loading initial data:', error);
        document.getElementById('assignedSubjects').textContent = '0';
        document.getElementById('todayPeriods').textContent = '0';
    }
}

async function loadOverviewData() {
    try {
        const todayData = await api.get('/timetable/faculty/today');
        const schedule = (todayData && todayData.schedule) ? todayData.schedule : (todayData && todayData.timetables) ? todayData.timetables : [];
        document.getElementById('todayPeriods').textContent = schedule.length;
        renderTodayTimetable(schedule);

        const weekData = await api.get('/timetable');
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        let weekCount = 0;
        
        let uniqueSubjectsMap = new Map();
        if (weekData && weekData.timetables) {
            days.forEach(day => {
                weekCount += weekData.timetables.filter(t => t.faculty && t.faculty._id === currentUser._id && t.day === day).length;
            });
            weekData.timetables.filter(t => t.faculty && t.faculty._id === currentUser._id).forEach(t => {
                if (t.subject && t.subject._id) {
                    uniqueSubjectsMap.set(t.subject._id, t.subject);
                }
            });
        }
        
        if (!currentUser.assignedSubjects || currentUser.assignedSubjects.length === 0) {
            currentUser.assignedSubjects = Array.from(uniqueSubjectsMap.values());
        }

        document.getElementById('weekClasses').textContent = weekCount;
        document.getElementById('assignedSubjects').textContent = currentUser.assignedSubjects ? currentUser.assignedSubjects.length : 0;

        renderWeeklyClassesChart((weekData && weekData.timetables) ? weekData.timetables : [], days);
        await renderAttendanceOverviewChart();
    } catch (error) {
        console.error('Error loading overview:', error);
    }
}

function renderWeeklyClassesChart(allTimetables, days) {
    const ctx = document.getElementById('weeklyClassesChart');
    if (!ctx) return;

    if (weeklyClassesChart) {
        weeklyClassesChart.destroy();
    }

    const facultyTimetables = allTimetables.filter(t => t.faculty && t.faculty._id === currentUser._id);
    const classesPerDay = days.map(day => 
        facultyTimetables.filter(t => t.day === day).length
    );

    weeklyClassesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days.map(d => d.substring(0, 3)),
            datasets: [{
                label: 'Classes',
                data: classesPerDay,
                backgroundColor: '#4a90e2',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: { size: 10 }
                    }
                },
                x: {
                    ticks: { font: { size: 10 } }
                }
            }
        }
    });
}

async function renderAttendanceOverviewChart() {
    const ctx = document.getElementById('attendanceOverviewChart');
    if (!ctx) return;

    if (attendanceOverviewChart) {
        attendanceOverviewChart.destroy();
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const attendanceData = await api.get(`/attendance?startDate=${weekAgo}&endDate=${today}`);
        
        const myAttendance = attendanceData.attendances.filter(a => 
            a.faculty && a.faculty._id === currentUser._id
        );
        
        let totalPresent = 0;
        let totalAbsent = 0;
        
        myAttendance.forEach(a => {
            if (a.status === 'present') totalPresent++;
            else totalAbsent++;
        });

        attendanceOverviewChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Absent'],
                datasets: [{
                    data: [totalPresent, totalAbsent],
                    backgroundColor: ['#50c878', '#e74c3c'],
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
    } catch (error) {
        console.error('Error loading attendance overview:', error);
        attendanceOverviewChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No Data'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#ccc'],
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
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    }
}

function renderTodayTimetable(timetables) {
    const container = document.getElementById('todayTimetableList');
    if (!container) return;
    if (!timetables || timetables.length === 0) {
        container.innerHTML = '<p class="text-center">No classes scheduled for today</p>';
        return;
    }

    container.innerHTML = timetables.map(t => `
        <div class="today-item">
            <span class="period">Period ${t.period}</span>
            <span class="class-name">${t.class?.className || 'N/A'}</span>
            <span class="subject">${t.subject?.subjectName || 'N/A'}</span>
        </div>
    `).join('');
}

async function loadTodayTimetable() {
    try {
        const data = await api.get('/timetable/faculty/today');
        renderTodayTimetable(data?.timetables || []);

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const today = days[new Date().getDay()];
        const todayBtn = document.querySelector(`.day-btn[data-day="${today}"]`);
        if (todayBtn) {
            todayBtn.click();
        } else {
            // Default to Monday if today's button isn't found (e.g., on Sunday)
            const mondayBtn = document.querySelector('.day-btn[data-day="Monday"]');
            if (mondayBtn) {
                mondayBtn.click();
            } else {
                loadFacultyTimetable('Monday');
            }
        }
    } catch (error) {
        console.error('Error loading today timetable:', error);
    }
}

async function loadFacultyTimetable(day) {
    try {
        const data = await api.get(`/timetable?facultyId=${currentUser._id}`);
        const dayTimetables = data.timetables.filter(t => t.day === day);

        const tbody = document.querySelector('#facultyTimetableTable tbody');
        if (!tbody) {
            console.error('#facultyTimetableTable tbody not found');
            return;
        }
        if (dayTimetables.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center">No classes on ${day}</td></tr>`;
            return;
        }

        tbody.innerHTML = dayTimetables.map(t => `
            <tr>
                <td>${t.period}</td>
                <td>${t.class?.className || 'N/A'}</td>
                <td>${t.subject?.subjectName || 'N/A'}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading timetable:', error);
    }
}

async function loadAttendanceFormData() {
    try {
        const profileData = await api.get('/auth/profile');
        currentUser = profileData.user;

        const timetableData = await api.get('/timetable?facultyId=' + currentUser._id);
        facultyTimetables = timetableData.timetables || [];

        const uniqueClasses = [...new Map(facultyTimetables.map(t => [t.class?._id, t.class])).values()];
        
        const classSelect = document.getElementById('attendanceClass');
        classSelect.innerHTML = '<option value="">Select Class</option>' +
            uniqueClasses.filter(c => c).map(c => `<option value="${c._id}">${c.className}</option>`).join('');

        const subjectSelect = document.getElementById('attendanceSubject');
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';

        const periodSelect = document.getElementById('attendancePeriod');
        periodSelect.innerHTML = '<option value="">Select Period</option>';

        classSelect.addEventListener('change', () => {
            loadSubjectsForAttendanceClass();
            resetAttendanceStudentList();
        });
        subjectSelect.addEventListener('change', () => {
            loadAvailableAttendancePeriods();
            resetAttendanceStudentList();
        });
        
        const attendanceDateInput = document.getElementById('attendanceDate');
        attendanceDateInput.addEventListener('change', () => {
            loadAvailableAttendancePeriods();
            tryLoadStudentsForSelectedPeriod();
        });

        periodSelect.addEventListener('change', () => {
            tryLoadStudentsForSelectedPeriod();
        });
        attendanceDateInput.value = getTodayDate();
    } catch (error) {
        console.error('Error loading attendance form data:', error);
    }
}

function resetAttendanceStudentList() {
    const studentsList = document.getElementById('studentsList');
    if (studentsList) studentsList.style.display = 'none';
}

function tryLoadStudentsForSelectedPeriod() {
    const classId = document.getElementById('attendanceClass').value;
    const subjectId = document.getElementById('attendanceSubject').value;
    const date = document.getElementById('attendanceDate').value;
    const period = document.getElementById('attendancePeriod').value;

    if (!classId || !subjectId || !date || !period) {
        return;
    }

    loadStudentsForAttendance(true);
}

async function loadSubjectsForAttendanceClass() {
    const classId = document.getElementById('attendanceClass').value;
    const subjectSelect = document.getElementById('attendanceSubject');
    const periodSelect = document.getElementById('attendancePeriod');
    
    periodSelect.innerHTML = '<option value="">Select Period</option>';
    
    if (!classId) {
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        return;
    }

    const classTimetables = facultyTimetables.filter(t => t.class?._id === classId);
    const uniqueSubjects = [...new Map(classTimetables.map(t => [t.subject?._id, t.subject])).values()];

    subjectSelect.innerHTML = '<option value="">Select Subject</option>' +
        uniqueSubjects.filter(s => s).map(s => `<option value="${s._id}">${s.subjectName}</option>`).join('');
}

async function loadAvailableAttendancePeriods() {
    const classId = document.getElementById('attendanceClass').value;
    const subjectId = document.getElementById('attendanceSubject').value;
    const periodSelect = document.getElementById('attendancePeriod');
    
    if (!classId || !subjectId) {
        periodSelect.innerHTML = '<option value="">Select Period</option>';
        return;
    }

    const matchingTimetables = facultyTimetables.filter(t => 
        t.class?._id === classId && t.subject?._id === subjectId
    );

    periodSelect.innerHTML = '<option value="">Select Period</option>' +
        matchingTimetables.map(t => `<option value="${t.period}">Period ${t.period}</option>`).join('');
}

async function loadStudentsForAttendance(silent = false) {
    const classId = document.getElementById('attendanceClass').value;
    const subjectId = document.getElementById('attendanceSubject').value;
    const date = document.getElementById('attendanceDate').value;
    const period = document.getElementById('attendancePeriod').value;

    if (!classId || !subjectId || !date || !period) {
        if (!silent) {
            alert('Please fill all fields');
        }
        return;
    }

    try {
        const classData = await api.get(`/classes/${classId}`);
        students = classData.class.students || [];

        if (students.length === 0) {
            if (!silent) {
                alert('No students in this class');
            }
            return;
        }

        const existingAttendance = await api.get(
            `/attendance/class?classId=${classId}&subjectId=${subjectId}&date=${date}&period=${period}`
        );

        const attendanceByStudentId = new Map(
            (existingAttendance.attendances || [])
                .filter(a => a && a.student && a.student._id)
                .map(a => [String(a.student._id), a.status])
        );

        selectedAttendanceData = {
            classId,
            subjectId,
            date,
            period,
            students: students.map(s => ({
                ...s,
                status: attendanceByStudentId.get(String(s._id)) || 'unmarked'
            }))
        };

        renderStudentsList();
        document.getElementById('studentsList').style.display = 'block';
        document.getElementById('studentsCount').textContent = students.length;
    } catch (error) {
        console.error('Error loading students:', error);
        if (!silent) {
            alert('Error loading students. Please try again.');
        }
    }
}

function renderStudentsList() {
    const container = document.getElementById('attendanceStudents');
    container.innerHTML = selectedAttendanceData.students.map((student, index) => `
        <div class="student-item">
            <span class="student-name">${student.name}</span>
            <div class="attendance-buttons">
                <button type="button" class="attendance-btn present ${student.status === 'present' ? 'selected' : ''}" 
                    onclick="setAttendance(${index}, 'present')">Present</button>
                <button type="button" class="attendance-btn absent ${student.status === 'absent' ? 'selected' : ''}" 
                    onclick="setAttendance(${index}, 'absent')">Absent</button>
                <button type="button" class="attendance-btn late ${student.status === 'late' ? 'selected' : ''}" 
                    onclick="setAttendance(${index}, 'late')">Late</button>
                <button type="button" class="attendance-btn ${student.status === 'unmarked' ? 'selected' : ''}" 
                    onclick="setAttendance(${index}, 'unmarked')">Unmarked</button>
            </div>
        </div>
    `).join('');
}

function setAttendance(index, status) {
    selectedAttendanceData.students[index].status = status;
    renderStudentsList();
}

function markAllPresent() {
    selectedAttendanceData.students.forEach((s, i) => {
        selectedAttendanceData.students[i].status = 'present';
    });
    renderStudentsList();
}

function markAllAbsent() {
    selectedAttendanceData.students.forEach((s, i) => {
        selectedAttendanceData.students[i].status = 'absent';
    });
    renderStudentsList();
}

async function submitAttendance() {
    try {
        const attendanceData = selectedAttendanceData.students
            .filter(student => ['present', 'absent', 'late'].includes(student.status))
            .map(student => ({
            studentId: student._id,
            subjectId: selectedAttendanceData.subjectId,
            classId: selectedAttendanceData.classId,
            date: selectedAttendanceData.date,
            period: parseInt(selectedAttendanceData.period),
            status: student.status
        }));

        if (attendanceData.length === 0) {
            alert('No students are marked yet. Set status for at least one student.');
            return;
        }

        const result = await api.post('/attendance/bulk', { attendanceData });

        const unmarkedCount = selectedAttendanceData.students.length - attendanceData.length;
        const skippedText = unmarkedCount > 0 ? `\nUnmarked (skipped): ${unmarkedCount}` : '';
        alert(`Attendance submitted successfully!\nSuccess: ${result.results.success.length}\nFailed: ${result.results.failed.length}${skippedText}`);
        
        document.getElementById('studentsList').style.display = 'none';
        document.getElementById('attendanceForm').reset();
        document.getElementById('attendanceDate').value = getTodayDate();
    } catch (error) {
        alert('Error submitting attendance: ' + error.message);
    }
}

async function loadHistoryFilters() {
    try {
        const profileData = await api.get('/auth/profile');
        currentUser = profileData.user;

        const timetableData = await api.get('/timetable?facultyId=' + currentUser._id);
        facultyTimetables = timetableData.timetables || [];

        const uniqueClasses = [...new Map(facultyTimetables.map(t => [t.class?._id, t.class])).values()];
        classes = uniqueClasses.filter(c => c);

        const classSelect = document.getElementById('historyClass');
        classSelect.innerHTML = '<option value="">Select Class</option>' +
            classes.map(c => `<option value="${c._id}">${c.className}</option>`).join('');

        const subjectSelect = document.getElementById('historySubject');
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';

        classSelect.onchange = () => {
            loadHistorySubjectsForClass();
        };
    } catch (error) {
        console.error('Error loading history filters:', error);
    }
}

function loadHistorySubjectsForClass() {
    const classId = document.getElementById('historyClass').value;
    const subjectSelect = document.getElementById('historySubject');

    if (!classId) {
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        return;
    }

    const classTimetables = facultyTimetables.filter(t => t.class?._id === classId);
    const uniqueSubjects = [...new Map(classTimetables.map(t => [t.subject?._id, t.subject])).values()]
        .filter(s => s && s._id);

    subjectSelect.innerHTML = '<option value="">Select Subject</option>' +
        uniqueSubjects.map(s => `<option value="${s._id}">${s.subjectName}</option>`).join('');
}

async function loadAttendanceHistory() {
    const classId = document.getElementById('historyClass').value;
    const subjectId = document.getElementById('historySubject').value;
    const date = document.getElementById('historyDate').value;

    let url = '/attendance?';
    if (classId) url += `classId=${classId}&`;
    if (subjectId) url += `subjectId=${subjectId}&`;
    if (date) url += `startDate=${date}&endDate=${date}`;

    try {
        const data = await api.get(url);
        renderHistoryTable(data.attendances);
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

function renderHistoryTable(attendances) {
    const tbody = document.querySelector('#historyTable tbody');
    if (!tbody) return;
    if (attendances.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No attendance records found</td></tr>';
        return;
    }

    const groupedMap = new Map();

    attendances.forEach((attendance) => {
        const classId = attendance.class?._id || 'na';
        const subjectId = attendance.subject?._id || 'na';
        const dateKey = new Date(attendance.date).toISOString().split('T')[0];
        const key = `${dateKey}|${attendance.period}|${classId}|${subjectId}`;

        if (!groupedMap.has(key)) {
            groupedMap.set(key, {
                date: attendance.date,
                period: attendance.period,
                className: attendance.class?.className || 'N/A',
                section: attendance.class?.section || attendance.class?.batch || 'N/A',
                subjectName: attendance.subject?.subjectName || 'N/A',
                records: []
            });
        }

        groupedMap.get(key).records.push(attendance);
    });

    groupedAttendanceHistory = Array.from(groupedMap.values());

    tbody.innerHTML = groupedAttendanceHistory.map((group, index) => {
        const presentCount = group.records.filter(r => r.status === 'present').length;
        const absentCount = group.records.filter(r => r.status === 'absent').length;
        const lateCount = group.records.filter(r => r.status === 'late').length;
        const modifiedCount = group.records.filter(r => r.isModified).length;

        return `
        <tr id="history-group-row-${index}">
            <td>${formatDate(group.date)}</td>
            <td>${group.period}</td>
            <td>${group.className}</td>
            <td>${group.section}</td>
            <td>${group.subjectName}</td>
            <td>
                <span class="text-success">P: ${presentCount}</span> |
                <span class="text-danger">A: ${absentCount}</span> |
                <span class="text-warning">L: ${lateCount}</span>
                ${modifiedCount > 0 ? `<span class="modified-indicator" title="${modifiedCount} student record(s) modified">*</span>` : ''}
            </td>
            <td>
                <button class="btn btn-small btn-secondary" onclick="openGroupEditModal(${index})">Edit</button>
            </td>
        </tr>
        `;
    }).join('');
}

function openGroupEditModal(groupIndex) {
    const group = groupedAttendanceHistory[groupIndex];
    if (!group) return;

    const modal = document.getElementById('editAttendanceModal');
    const modalBody = document.getElementById('editAttendanceModalBody');

    modalBody.innerHTML = `
        <div class="group-edit-meta">
            <p><strong>Date:</strong> ${formatDate(group.date)}</p>
            <p><strong>Period:</strong> ${group.period}</p>
            <p><strong>Class:</strong> ${group.className}</p>
            <p><strong>Section:</strong> ${group.section}</p>
            <p><strong>Subject:</strong> ${group.subjectName}</p>
        </div>
        <div class="group-edit-list" id="groupEditList">
            ${group.records.map((record) => `
                <div class="group-edit-row" id="edit-row-${record._id}">
                    <div class="group-edit-student">
                        <strong>${record.student?.name || 'N/A'}</strong>
                        ${record.student?.uniqueId ? `<span class="group-edit-id">${record.student.uniqueId}</span>` : ''}
                    </div>
                    <select class="group-edit-status" id="edit-status-${record._id}">
                        <option value="present" ${record.status === 'present' ? 'selected' : ''}>Present</option>
                        <option value="absent" ${record.status === 'absent' ? 'selected' : ''}>Absent</option>
                        <option value="late" ${record.status === 'late' ? 'selected' : ''}>Late</option>
                    </select>
                </div>
            `).join('')}
        </div>
        <div class="form-group" style="margin-top: 12px;">
            <label for="modificationReason">Reason for Change</label>
            <textarea id="modificationReason" rows="3" placeholder="Required if you change any status."></textarea>
        </div>
        <button class="btn btn-primary" id="saveAttendanceChange">Save Changes</button>
    `;

    const saveButton = document.getElementById('saveAttendanceChange');
    saveButton.onclick = () => updateAttendanceGroup(groupIndex);
    
    modal.classList.add('active');
}

function closeEditModal() {
    document.getElementById('editAttendanceModal').classList.remove('active');
}

async function updateAttendance(attendanceId, newStatus, reason) {
    try {
        const result = await api.put(`/attendance/${attendanceId}`, {
            status: newStatus,
            modificationReason: reason
        });
        return { success: true, result };
    } catch (error) {
        return { success: false, error };
    }
}

async function updateAttendanceGroup(groupIndex) {
    const group = groupedAttendanceHistory[groupIndex];
    if (!group) return;

    const reason = document.getElementById('modificationReason').value;

    const changedRecords = group.records
        .map((record) => {
            const statusEl = document.getElementById(`edit-status-${record._id}`);
            const newStatus = statusEl ? statusEl.value : record.status;
            return {
                attendanceId: record._id,
                oldStatus: record.status,
                newStatus
            };
        })
        .filter((item) => item.oldStatus !== item.newStatus);

    if (changedRecords.length === 0) {
        alert('No status changes to save.');
        return;
    }

    if (!reason) {
        alert('A reason for the change is mandatory.');
        return;
    }

    try {
        let successCount = 0;
        let failedCount = 0;

        for (const item of changedRecords) {
            const update = await updateAttendance(item.attendanceId, item.newStatus, reason);
            if (update.success) {
                successCount += 1;
            } else {
                failedCount += 1;
                console.error('Attendance update failed:', update.error);
            }
        }

        if (successCount > 0) {
            await loadAttendanceHistory();
        }

        closeEditModal();
        alert(`Attendance update completed. Success: ${successCount}, Failed: ${failedCount}`);

    } catch (error) {
        alert('Error updating attendance: ' + (error.response?.data?.error || error.message));
    }
}

function closeModal() {
    const editModal = document.getElementById('editAttendanceModal');
    if (editModal) editModal.classList.remove('active');
    
    const mainModal = document.getElementById('modal');
    if (mainModal) mainModal.classList.remove('active');
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModal();
    }
});

let qrCodeChart = null;
let trendsChart = null;
let activeSessionInterval = null;
let currentQRSession = null;
let currentQRInterval = null;
let activeSessionIds = [];
let facultyTimetables = [];

async function loadQRFormData() {
    try {
        const profileData = await api.get('/auth/profile');
        currentUser = profileData.user;

        const timetableData = await api.get('/timetable?facultyId=' + currentUser._id);
        facultyTimetables = timetableData.timetables || [];

        const uniqueClasses = [...new Map(facultyTimetables.map(t => [t.class?._id, t.class])).values()];
        
        const classSelect = document.getElementById('qrClass');
        classSelect.innerHTML = '<option value="">Select Class</option>' +
            uniqueClasses.filter(c => c).map(c => `<option value="${c._id}">${c.className}</option>`).join('');

        const subjectSelect = document.getElementById('qrSubject');
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';

        const periodSelect = document.getElementById('qrPeriod');
        periodSelect.innerHTML = '<option value="">Select Period</option>';

        classSelect.addEventListener('change', () => loadSubjectsForClass());
        subjectSelect.addEventListener('change', () => loadAvailablePeriods());

        const qrDateInput = document.getElementById('qrDate');
        qrDateInput.addEventListener('change', () => loadAvailablePeriods());
        qrDateInput.value = getTodayDate();

        await loadActiveSessions();
    } catch (error) {
        console.error('Error loading QR form data:', error);
    }
}

async function loadSubjectsForClass() {
    const classId = document.getElementById('qrClass').value;
    const subjectSelect = document.getElementById('qrSubject');
    const periodSelect = document.getElementById('qrPeriod');
    
    periodSelect.innerHTML = '<option value="">Select Period</option>';
    
    if (!classId) {
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        return;
    }

    const classTimetables = facultyTimetables.filter(t => t.class?._id === classId);
    const uniqueSubjects = [...new Map(classTimetables.map(t => [t.subject?._id, t.subject])).values()];

    subjectSelect.innerHTML = '<option value="">Select Subject</option>' +
        uniqueSubjects.filter(s => s).map(s => `<option value="${s._id}">${s.subjectName}</option>`).join('');
}

async function loadAvailablePeriods() {
    const classId = document.getElementById('qrClass').value;
    const subjectId = document.getElementById('qrSubject').value;
    const periodSelect = document.getElementById('qrPeriod');
    
    if (!classId || !subjectId) {
        periodSelect.innerHTML = '<option value="">Select Period</option>';
        return;
    }

    const matchingTimetables = facultyTimetables.filter(t => 
        t.class?._id === classId && t.subject?._id === subjectId
    );

    periodSelect.innerHTML = '<option value="">Select Period</option>' +
        matchingTimetables.map(t => `<option value="${t.period}">Period ${t.period}</option>`).join('');
}

async function loadActiveSessions() {
    try {
        const response = await api.get('/qr/active');
        activeSessionIds = response.sessions.map(s => s._id);
        renderSessionsList(response.sessions);
        
        if (response.sessions.length > 0 && !activeSessionInterval) {
            activeSessionInterval = setInterval(loadActiveSessions, 5000);
        } else if (response.sessions.length === 0 && activeSessionInterval) {
            clearInterval(activeSessionInterval);
            activeSessionInterval = null;
        }
        
        if (response.sessions.length > 0 && !currentQRInterval) {
            currentQRInterval = setInterval(refreshQRImages, 10000);
        } else if (response.sessions.length === 0 && currentQRInterval) {
            clearInterval(currentQRInterval);
            currentQRInterval = null;
        }
    } catch (error) {
        console.error('Error loading active sessions:', error);
    }
}

function refreshQRImages() {
    activeSessionIds.forEach(async (sessionId) => {
        const qrImg = document.getElementById(`qr-img-${sessionId}`);
        if (!qrImg) return;

        try {
            const payloadRes = await api.get(`/qr/payload/${sessionId}`);
            const timestamp = new Date().getTime();
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payloadRes.qrCode)}&t=${timestamp}`;
        } catch (error) {
            console.error('Failed to refresh QR payload:', error);
        }
    });
}

function renderSessionsList(sessions) {
    const container = document.getElementById('sessionsList');
    if (!container) return;
    
    if (sessions.length === 0) {
        container.innerHTML = '<p class="text-center">No active sessions</p>';
        return;
    }

    container.innerHTML = sessions.map(session => `
        <div class="session-card" id="session-${session._id}">
            <div class="session-header">
                <h5>${session.className} - ${session.subjectName}</h5>
                <span class="session-status ${new Date(session.expiresAt) > new Date() ? 'active' : 'expired'}">
                    ${new Date(session.expiresAt) > new Date() ? 'Active' : 'Expired'}
                </span>
            </div>
            <div class="session-details">
                <p><strong>Period:</strong> ${session.period}</p>
                <p><strong>Checked In:</strong> ${session.checkedIn} / ${session.totalStudents}</p>
                <p><strong>Expires:</strong> ${new Date(session.expiresAt).toLocaleTimeString()}</p>
            </div>
            <div class="session-actions">
                <button class="btn btn-primary btn-small" onclick="viewQRDetails('${session._id}')">View QR</button>
                <button class="btn btn-danger btn-small" onclick="endSession('${session._id}')">End</button>
            </div>
            <div class="session-qr" id="qr-${session._id}" style="display:none;">
                <img id="qr-img-${session._id}" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(session.qrCode || session._id)}" alt="QR Code">
                <p style="margin-top: 8px; font-size: 12px; color: #888;">QR refreshes every 10 seconds</p>
                <p>Session ID: <code>${session._id}</code></p>
                <button class="btn btn-primary" onclick="window.open('/student-dashboard.html?scan=true&session=${session._id}', '_blank')">Open Student Check-in Page</button>
            </div>
        </div>
    `).join('');
}

function viewQRDetails(sessionId) {
    const qrDiv = document.getElementById(`qr-${sessionId}`);
    if (qrDiv) {
        qrDiv.style.display = qrDiv.style.display === 'none' ? 'block' : 'none';
    }
}

async function endSession(sessionId) {
    if (!confirm('Are you sure you want to end this session?')) return;
    
    try {
        await api.post('/qr/end', { sessionId });
        await loadActiveSessions();
        alert('Session ended');
    } catch (error) {
        alert('Error ending session: ' + error.message);
    }
}

async function generateQRCode() {
    const classId = document.getElementById('qrClass').value;
    const subjectId = document.getElementById('qrSubject').value;
    const date = document.getElementById('qrDate').value;
    const period = document.getElementById('qrPeriod').value;
    const validity = document.getElementById('qrValidity').value;

    if (!classId || !subjectId || !date || !period) {
        alert('Please fill all fields');
        return;
    }

    try {
        const result = await api.post('/qr/generate', {
            classId,
            subjectId,
            date,
            period: parseInt(period),
            validityMinutes: parseInt(validity)
        });

        const studentLink = `${window.location.origin}/client/html/student-dashboard.html?scan=true&session=${result.sessionId}`;
        const sessionId = result.sessionId;
        
        document.getElementById('modalTitle').textContent = 'QR Code Generated';
        document.getElementById('modalBody').innerHTML = `
            <div style="text-align: center;">
                <img id="modal-qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.qrCode || sessionId)}" 
                     alt="QR Code" style="max-width: 200px; border-radius: 8px; margin-bottom: 16px;">
                <p style="font-size: 12px; color: #e74c3c; margin-bottom: 12px;">🔄 QR refreshes every 10 seconds</p>
                <p><strong>Class:</strong> ${result.className}</p>
                <p><strong>Subject:</strong> ${result.subjectName}</p>
                <p><strong>Period:</strong> ${result.period}</p>
                <p><strong>Valid for:</strong> ${result.validityMinutes} minutes</p>
                <div style="margin-top: 16px;">
                    <p style="font-size: 0.9rem; color: #666;">Share this link with students:</p>
                    <input type="text" value="${studentLink}" readonly 
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.85rem;">
                    <button class="btn btn-primary" style="margin-top: 12px;" 
                            onclick="navigator.clipboard.writeText('${studentLink}'); alert('Link copied!');">
                        Copy Link
                    </button>
                </div>
            </div>
        `;
        document.getElementById('modal').classList.add('active');

        const modalQRInterval = setInterval(() => {
            const qrImg = document.getElementById('modal-qr-image');
            if (!qrImg || !document.getElementById('modal').classList.contains('active')) {
                clearInterval(modalQRInterval);
                return;
            }

            api.get(`/qr/payload/${sessionId}`)
                .then(payloadRes => {
                    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payloadRes.qrCode)}&t=${new Date().getTime()}`;
                })
                .catch(error => console.error('Failed to refresh modal QR payload:', error));
        }, 10000);

        await loadActiveSessions();
    } catch (error) {
        alert('Error generating QR code: ' + error.message);
    }
}

async function loadAnalyticsFilters() {
    try {
        const classesData = await api.get('/classes');
        classes = classesData.classes;

        const classSelect = document.getElementById('analyticsClass');
        classSelect.innerHTML = '<option value="">All Classes</option>' +
            classes.map(c => `<option value="${c._id}">${c.className}</option>`).join('');

        const profileData = await api.get('/auth/profile');
        currentUser = profileData.user;

        const subjectSelect = document.getElementById('analyticsSubject');
        subjectSelect.innerHTML = '<option value="">All Subjects</option>' +
            (currentUser.assignedSubjects || []).map(s => 
                `<option value="${s._id}">${s.subjectName}</option>`
            ).join('');

        const today = new Date();
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        document.getElementById('analyticsStartDate').value = weekAgo.toISOString().split('T')[0];
        document.getElementById('analyticsEndDate').value = today.toISOString().split('T')[0];
        
        await loadAnalytics();
    } catch (error) {
        console.error('Error loading analytics filters:', error);
    }
}

async function loadAnalytics() {
    const classId = document.getElementById('analyticsClass').value;
    const subjectId = document.getElementById('analyticsSubject').value;
    const startDate = document.getElementById('analyticsStartDate').value;
    const endDate = document.getElementById('analyticsEndDate').value;

    try {
        const summary = await api.get(`/analytics/summary?classId=${classId || ''}&subjectId=${subjectId || ''}&startDate=${startDate || ''}&endDate=${endDate || ''}`);

        document.getElementById('totalClassesAnalytics').textContent = summary.total;
        document.getElementById('presentAnalytics').textContent = summary.present;
        document.getElementById('absentAnalytics').textContent = summary.absent;
        document.getElementById('percentageAnalytics').textContent = summary.attendancePercentage + '%';

        const studentsData = await api.get(`/analytics/by-student?classId=${classId || ''}&subjectId=${subjectId || ''}&startDate=${startDate || ''}&endDate=${endDate || ''}`);
        renderStudentAnalyticsChart(studentsData.students);

        const trendsData = await api.get(`/analytics/trends?classId=${classId || ''}&subjectId=${subjectId || ''}&days=30`);
        renderTrendsChart(trendsData.trends);
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

function renderStudentAnalyticsChart(students) {
    const ctx = document.getElementById('studentAnalyticsChart');
    if (!ctx) return;

    if (qrCodeChart) {
        qrCodeChart.destroy();
    }

    const topStudents = students.slice(0, 10);
    
    qrCodeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topStudents.map(s => s.studentName.substring(0, 10)),
            datasets: [{
                label: 'Attendance %',
                data: topStudents.map(s => s.percentage.toFixed(2)),
                backgroundColor: topStudents.map(s => s.percentage < 75 ? '#e74c3c' : '#50c878'),
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

function renderTrendsChart(trends) {
    const ctx = document.getElementById('trendsChart');
    if (!ctx) return;

    if (trendsChart) {
        trendsChart.destroy();
    }

    trendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trends.map(t => t._id),
            datasets: [{
                label: 'Present',
                data: trends.map(t => t.present),
                borderColor: '#50c878',
                tension: 0.3
            }, {
                label: 'Absent',
                data: trends.map(t => t.absent),
                borderColor: '#e74c3c',
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function exportAnalytics(type) {
    const classId = document.getElementById('analyticsClass').value;
    const subjectId = document.getElementById('analyticsSubject').value;
    const startDate = document.getElementById('analyticsStartDate').value;
    const endDate = document.getElementById('analyticsEndDate').value;

    let url = `/api/export/${type}?`;
    if (classId) url += `classId=${classId}&`;
    if (subjectId) url += `subjectId=${subjectId}&`;
    if (startDate) url += `startDate=${startDate}&`;
    if (endDate) url += `endDate=${endDate}`;

    window.open(url, '_blank');
}

async function loadLeaveRequests() {
    try {
        const data = await api.get('/leave-requests');
        renderLeaveRequestsTable(data.leaveRequests);
    } catch (error) {
        console.error('Error loading leave requests:', error);
    }
}

function renderLeaveRequestsTable(leaveRequests) {
    const tbody = document.querySelector('#leaveRequestsTable tbody');
    if (leaveRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No leave requests</td></tr>';
        return;
    }

    tbody.innerHTML = leaveRequests.map(lr => `
        <tr>
            <td>${formatDate(lr.date)}</td>
            <td>${lr.student?.name || 'N/A'}</td>
            <td>${lr.subject?.subjectName || 'N/A'}</td>
            <td>${lr.reason}</td>
            <td><span class="status-badge status-${lr.status}">${lr.status}</span></td>
            <td>
                ${lr.status === 'pending' ? `
                    <button class="btn btn-success btn-small" onclick="approveLeave('${lr._id}')">Approve</button>
                    <button class="btn btn-danger btn-small" onclick="rejectLeave('${lr._id}')">Reject</button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

async function approveLeave(leaveId) {
    const comment = prompt('Add a comment (optional):');
    try {
        await api.put(`/leave-requests/${leaveId}/approve`, { comment: comment || '' });
        await loadLeaveRequests();
        alert('Leave request approved');
    } catch (error) {
        alert('Error approving leave: ' + error.message);
    }
}

async function rejectLeave(leaveId) {
    const comment = prompt('Reason for rejection:');
    if (comment === null) return;
    try {
        await api.put(`/leave-requests/${leaveId}/reject`, { comment: comment || '' });
        await loadLeaveRequests();
        alert('Leave request rejected');
    } catch (error) {
        alert('Error rejecting leave: ' + error.message);
    }
}

async function loadAnnouncements() {
    try {
        const response = await api.get('/announcements');
        const banner = document.getElementById('announcementBanner');
        if (!banner) return;
        if (response.announcements && response.announcements.length > 0) {
            const announcements = response.announcements.slice(0, 3);
            banner.innerHTML = `
                <div class="announcement-banner-head">
                    <h3>Latest Announcements</h3>
                    <span class="announcement-count">${announcements.length}</span>
                </div>
                <div class="announcement-list-grid">
                    ${announcements.map(ann => `
                        <div class="announcement">
                            <button type="button" class="announcement-close-btn" aria-label="Close announcement" onclick="dismissAnnouncementCard(this)">x</button>
                            <h4>${escapeHtml(ann.title)}</h4>
                            <p>${escapeHtml(ann.content)}</p>
                            <div class="announcement-meta">
                                Posted by ${escapeHtml(ann.createdBy?.name || 'Unknown')} on ${new Date(ann.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="announcement-banner-actions">
                    <a class="btn btn-secondary btn-small" href="announcements.html">View All</a>
                </div>
            `;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load announcements:', error);
    }
}

function dismissAnnouncementCard(button) {
    const card = button?.closest('.announcement');
    const banner = document.getElementById('announcementBanner');
    if (!card || !banner) return;

    card.remove();
    if (!banner.querySelector('.announcement')) {
        banner.style.display = 'none';
    }
}

async function loadTodaySchedule() {
    const scheduleWidget = document.getElementById('todays-schedule');
    if (!scheduleWidget) {
        return;
    }
    const scheduleList = scheduleWidget.querySelector('.schedule-list');
    const nextClassElement = document.getElementById('next-class');

    try {
        const { schedule } = await api.get('/timetable/today');
        scheduleList.innerHTML = '';

        if (schedule.length === 0) {
            scheduleList.innerHTML = '<p>No classes scheduled for today.</p>';
            nextClassElement.innerHTML = 'Enjoy your day off!';
            return;
        }

        schedule.forEach(item => {
            const li = document.createElement('li');
            li.className = `schedule-item ${item.isSubstitution ? 'substitution' : ''} ${item.isSubstituted ? 'substituted-away' : ''}`;
            li.innerHTML = `
                <span class="period-time">Period ${escapeHtml(item.period)}</span>
                <span class="subject-name">${escapeHtml(item.subject?.name)}</span>
                <span class="class-name">${escapeHtml(item.class?.name)}</span>
                ${item.isSubstitution ? `<span class="sub-info">${escapeHtml(item.substitutionDetails)}</span>` : ''}
                ${item.isSubstituted ? `<span class="sub-info">${escapeHtml(item.substitutionDetails)}</span>` : ''}
            `;
            scheduleList.appendChild(li);
        });

        // Find next class (logic remains the same)
        // ...
    } catch (error) {
        console.error('Failed to load today\'s schedule', error);
        scheduleList.innerHTML = '<p>Could not load schedule.</p>';
    }
}






