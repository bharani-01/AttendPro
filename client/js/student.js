let currentUser = null;
let subjectChart = null;
let attendancePieChart = null;
let studentTimetableEntries = [];
let leaveFormBindingsInitialized = false;
const STUDENT_TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STUDENT_TIMETABLE_COLUMNS = [
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
    if (!currentUser || currentUser.role !== 'student') {
        return;
    }

    document.getElementById('userName').textContent = currentUser.name;
    
    setupNavigation();
    setupLogoutHandler();
    setupUserMenu();
    await applyDashboardSettings();
    await loadOverviewData();
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
        case 'attendance':
            await loadSubjectAttendance();
            break;
        case 'daily':
            await loadDailyLogs();
            break;
        case 'timetable':
            await loadStudentTimetable();
            break;
        case 'leave':
            await loadLeaveFormData();
            await loadMyLeaveRequests();
            break;
        case 'checkin':
            await setupQRCheckin();
            break;
    }
}

async function saveWidgetSetting(widgetName, settings) {
    try {
        await api.post(`/settings/widget/${widgetName}`, { settings });
    } catch (error) {
        console.error(`Failed to save ${widgetName} settings:`, error);
    }
}

async function loadWidgetSetting(widgetName) {
    try {
        const settings = await api.get(`/settings/widget/${widgetName}`);
        return settings;
    } catch (error) {
        console.error(`Failed to load ${widgetName} settings:`, error);
        return null;
    }
}

async function loadOverviewData() {
    try {
        const profileData = await api.get('/auth/profile');
        currentUser = profileData.user;
        document.getElementById('userName').textContent = currentUser.name;

        const summaryData = await api.get('/attendance/student/summary');

        document.getElementById('overallAttendance').textContent = summaryData.overall.attendancePercentage + '%';
        document.getElementById('totalClasses').textContent = summaryData.overall.totalClasses;
        document.getElementById('totalPresent').textContent = summaryData.overall.totalPresent;
        document.getElementById('totalAbsent').textContent = summaryData.overall.totalAbsent;

        const progressBar = document.getElementById('overallProgress');
        progressBar.style.width = summaryData.overall.attendancePercentage + '%';
        
        if (summaryData.overall.attendancePercentage < 75) {
            progressBar.classList.add('danger');
            document.getElementById('attendanceAlert').style.display = 'flex';
            document.getElementById('alertMessage').textContent = 
                `Your overall attendance is ${summaryData.overall.attendancePercentage}%. Please attend more classes to reach 75%.`;
        } else if (summaryData.overall.attendancePercentage < 85) {
            progressBar.classList.add('warning');
            document.getElementById('attendanceAlert').style.display = 'none';
        } else {
            progressBar.classList.remove('warning', 'danger');
            document.getElementById('attendanceAlert').style.display = 'none';
        }

        renderSubjectSummary(summaryData.summary);
        renderSubjectChart(summaryData.summary);
        renderAttendancePieChart(summaryData.overall);
    } catch (error) {
        console.error('Error loading overview:', error);
    }
}

function renderSubjectChart(summary) {
    const ctx = document.getElementById('subjectChart');
    if (!ctx) return;

    if (subjectChart) {
        subjectChart.destroy();
    }

    const labels = summary.map(s => s.subjectName);
    const data = summary.map(s => s.attendancePercentage);

    subjectChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length > 0 ? labels : ['No Data'],
            datasets: [{
                label: 'Attendance %',
                data: data.length > 0 ? data : [0],
                backgroundColor: data.map(p => 
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
                    ticks: {
                        font: { size: 10 }
                    }
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

function renderAttendancePieChart(overall) {
    const ctx = document.getElementById('attendancePieChart');
    if (!ctx) return;

    if (attendancePieChart) {
        attendancePieChart.destroy();
    }

    attendancePieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Absent'],
            datasets: [{
                data: [overall.totalPresent, overall.totalAbsent],
                backgroundColor: ['#27ae60', '#e74c3c'],
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

function renderSubjectSummary(summary) {
    const container = document.getElementById('subjectSummaryList');
    
    if (summary.length === 0) {
        container.innerHTML = '<p class="text-center">No attendance records found</p>';
        return;
    }

    container.innerHTML = summary.map(s => {
        let percentageClass = 'good';
        if (s.attendancePercentage < 75) percentageClass = 'danger';
        else if (s.attendancePercentage < 85) percentageClass = 'warning';

        return `
            <div class="subject-item">
                <div>
                    <div class="subject-name">${s.subjectName}</div>
                    <small>${s.subjectCode}</small>
                </div>
                <span class="subject-percentage ${percentageClass}">${s.attendancePercentage}%</span>
            </div>
        `;
    }).join('');
}

async function loadSubjectAttendance() {
    try {
        const summaryData = await api.get('/attendance/student/summary');
        renderSubjectAttendanceTable(summaryData.summary);
    } catch (error) {
        console.error('Error loading subject attendance:', error);
    }
}

function renderSubjectAttendanceTable(summary) {
    const tbody = document.querySelector('#subjectAttendanceTable tbody');
    
    if (summary.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No attendance records found</td></tr>';
        return;
    }

    tbody.innerHTML = summary.map(s => {
        let statusClass = 'text-success';
        let statusText = 'Good';
        
        if (s.attendancePercentage < 75) {
            statusClass = 'text-danger';
            statusText = 'Below 75%';
        } else if (s.attendancePercentage < 85) {
            statusClass = 'text-warning';
            statusText = 'Monitor';
        }

        return `
            <tr>
                <td>${s.subjectName}</td>
                <td>${s.subjectCode}</td>
                <td>${s.totalClasses}</td>
                <td>${s.present}</td>
                <td>${s.absent}</td>
                <td class="${s.attendancePercentage < 75 ? 'text-danger' : 'text-success'}">${s.attendancePercentage}%</td>
                <td class="${statusClass}">${statusText}</td>
            </tr>
        `;
    }).join('');
}

async function loadDailyLogs() {
    try {
        const profileData = await api.get('/auth/profile');
        currentUser = profileData.user;

        const attendanceData = await api.get('/attendance/student');
        renderDailyLogsTable(attendanceData.attendances);

        const subjects = [...new Set(attendanceData.attendances.map(a => a.subject?._id))];
        const subjectSelect = document.getElementById('dailySubject');
        subjectSelect.innerHTML = '<option value="">All Subjects</option>' +
            subjects.map(s => {
                const att = attendanceData.attendances.find(a => a.subject?._id === s);
                return `<option value="${s}">${att?.subject?.subjectName || 'Unknown'}</option>`;
            }).join('');
    } catch (error) {
        console.error('Error loading daily logs:', error);
    }
}

async function loadDailyLogsFiltered() {
    const subjectId = document.getElementById('dailySubject').value;
    const startDate = document.getElementById('dailyStartDate').value;
    const endDate = document.getElementById('dailyEndDate').value;

    let url = '/attendance/student?';
    if (subjectId) url += `subjectId=${subjectId}&`;
    if (startDate) url += `startDate=${startDate}&`;
    if (endDate) url += `endDate=${endDate}`;

    try {
        const data = await api.get(url);
        renderDailyLogsTable(data.attendances);
    } catch (error) {
        console.error('Error loading daily logs:', error);
    }
}

function renderDailyLogsTable(attendances) {
    const tbody = document.querySelector('#dailyLogsTable tbody');
    
    if (attendances.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No attendance records found</td></tr>';
        return;
    }

    tbody.innerHTML = attendances.map(a => `
        <tr>
            <td>${formatDate(a.date)}</td>
            <td>${a.period}</td>
            <td>${a.subject?.subjectName || 'N/A'}</td>
            <td>${a.class?.className || 'N/A'}</td>
            <td class="${a.status === 'present' ? 'text-success' : 'text-danger'}">${a.status}</td>
        </tr>
    `).join('');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

async function loadStudentTimetable() {
    try {
        const profileData = await api.get('/auth/profile');
        currentUser = profileData.user;

        const meta = document.getElementById('studentTimetableClassMeta');
        if (!currentUser.assignedClass?._id) {
            if (meta) {
                meta.textContent = 'You are not assigned to a class yet.';
            }
            renderStudentTimetableGrid([]);
            return;
        }

        const classInfo = currentUser.assignedClass;
        if (meta) {
            meta.textContent = `${classInfo.className} | ${classInfo.department || '-'} | Year ${classInfo.year || '-'} | Batch ${classInfo.batch || '-'}`;
        }

        const data = await api.get(`/timetable?classId=${classInfo._id}`);
        studentTimetableEntries = data.timetables || [];
        renderStudentTimetableGrid(studentTimetableEntries);
    } catch (error) {
        console.error('Error loading student timetable:', error);
        renderStudentTimetableGrid([]);
    }
}

function renderStudentTimetableGrid(timetables) {
    const table = document.getElementById('studentWeeklyTimetableGrid');
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    if (thead) {
        const headerCells = STUDENT_TIMETABLE_COLUMNS.map((col) => {
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

    const list = timetables || [];
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">No timetable entries found for your class.</td></tr>';
        return;
    }

    const slotMap = new Map();
    list.forEach((entry) => {
        slotMap.set(`${entry.day}-${entry.period}`, entry);
    });

    const rows = STUDENT_TIMETABLE_DAYS.map((day) => {
        const cells = STUDENT_TIMETABLE_COLUMNS.map((col) => {
            if (col.type === 'break') {
                return `<td class="timetable-slot break-cell">${col.label}</td>`;
            }

            const entry = slotMap.get(`${day}-${col.period}`);
            if (!entry) {
                return '<td class="timetable-slot empty-slot"><span style="color:var(--gray-400); font-size:12px;">-</span></td>';
            }

            return `
                <td class="timetable-slot filled-slot">
                    <div class="slot-subject">${entry.subject?.subjectCode ? `${entry.subject.subjectCode} - ` : ''}${entry.subject?.subjectName || 'N/A'}</div>
                    <div class="slot-faculty"><strong>Faculty:</strong> ${entry.faculty?.name || 'N/A'}</div>
                    <div class="slot-room">${entry.roomNo ? `Room: ${entry.roomNo}` : 'Room: N/A'}</div>
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

async function loadLeaveFormData() {
    try {
        const dateInput = document.getElementById('leaveDate');
        const subjectSelect = document.getElementById('leaveSubject');
        const periodSelect = document.getElementById('leavePeriod');
        if (!dateInput || !subjectSelect || !periodSelect) return;

        if (!dateInput.value) {
            dateInput.value = getTodayDate();
        }

        if (!leaveFormBindingsInitialized) {
            dateInput.addEventListener('change', async () => {
                await loadEligibleLeaveSubjectsByDate(dateInput.value);
            });

            subjectSelect.addEventListener('change', () => {
                const selectedOption = subjectSelect.options[subjectSelect.selectedIndex];
                if (!selectedOption) return;

                // Keep period choices relevant to selected subject when possible.
                const periodsText = selectedOption.getAttribute('data-periods') || '';
                if (!periodsText || selectedOption.value === '__all__') return;

                const periods = periodsText
                    .split(',')
                    .map((p) => Number(p.trim()))
                    .filter((p) => Number.isFinite(p))
                    .sort((a, b) => a - b);

                if (!periods.length) return;

                const currentValue = periodSelect.value;
                periodSelect.innerHTML = '<option value="">Full Day</option>' +
                    periods.map((p) => `<option value="${p}">${p}</option>`).join('');

                if (currentValue && periods.includes(Number(currentValue))) {
                    periodSelect.value = currentValue;
                }
            });

            leaveFormBindingsInitialized = true;
        }

        await loadEligibleLeaveSubjectsByDate(dateInput.value);
    } catch (error) {
        console.error('Error loading leave form data:', error);
    }
}

async function loadEligibleLeaveSubjectsByDate(date) {
    const subjectSelect = document.getElementById('leaveSubject');
    const periodSelect = document.getElementById('leavePeriod');
    if (!subjectSelect || !periodSelect) return;

    subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
    periodSelect.innerHTML = '<option value="">Full Day</option>';

    if (!date) {
        subjectSelect.innerHTML = '<option value="">Select date first</option>';
        return;
    }

    try {
        const data = await api.get(`/leave-requests/available-subjects?date=${encodeURIComponent(date)}`);
        const subjects = Array.isArray(data?.subjects) ? data.subjects : [];
        const periods = Array.isArray(data?.periods) ? data.periods : [];

        if (!subjects.length) {
            subjectSelect.innerHTML = '<option value="">No classes on selected date</option>';
        } else {
            subjectSelect.innerHTML = [
                '<option value="">Select Subject</option>',
                '<option value="__all__">All Subjects</option>',
                ...subjects.map((s) => {
                    const periodAttr = Array.isArray(s.periods) ? s.periods.join(',') : '';
                    const code = s.subjectCode ? ` (${s.subjectCode})` : '';
                    return `<option value="${s._id}" data-periods="${periodAttr}">${s.subjectName}${code}</option>`;
                })
            ].join('');
        }

        periodSelect.innerHTML = '<option value="">Full Day</option>' +
            periods.map((p) => `<option value="${p}">${p}</option>`).join('');
    } catch (error) {
        console.error('Error loading leave subjects for date:', error);
        subjectSelect.innerHTML = '<option value="">Failed to load subjects</option>';
    }
}

async function submitLeaveRequest() {
    const subjectId = document.getElementById('leaveSubject').value;
    const date = document.getElementById('leaveDate').value;
    const period = document.getElementById('leavePeriod').value;
    const reason = document.getElementById('leaveReason').value;

    if (!subjectId || !date || !reason) {
        alert('Please fill all required fields');
        return;
    }

    try {
        const result = await api.post('/leave-requests', {
            subjectId,
            date,
            period: period ? parseInt(period) : null,
            reason
        });

        alert(result?.message || 'Leave request submitted successfully');
        document.getElementById('leaveRequestForm').reset();
        document.getElementById('leaveDate').value = getTodayDate();
        await loadEligibleLeaveSubjectsByDate(document.getElementById('leaveDate').value);
        await loadMyLeaveRequests();
    } catch (error) {
        alert('Error submitting leave request: ' + error.message);
    }
}

async function loadMyLeaveRequests() {
    try {
        const data = await api.get('/leave-requests');
        renderMyLeaveRequestsTable(data.leaveRequests);
    } catch (error) {
        console.error('Error loading leave requests:', error);
    }
}

function renderMyLeaveRequestsTable(leaveRequests) {
    const tbody = document.querySelector('#myLeaveRequestsTable tbody');
    if (leaveRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">No leave requests</td></tr>';
        return;
    }

    tbody.innerHTML = leaveRequests.map(lr => `
        <tr>
            <td>${formatDate(lr.date)}</td>
            <td>${lr.subject?.subjectName || 'N/A'}</td>
            <td>${lr.reason}</td>
            <td><span class="status-badge status-${lr.status}">${lr.status}</span></td>
        </tr>
    `).join('');
}

let html5QrcodeScanner = null;
let currentSessionId = null;
let currentQrToken = null;
let scannerInterval = null;
let lastScannedSession = null;
let html5QrCode = null;

function parseScannedQRPayload(decodedText) {
    try {
        const parsed = JSON.parse(decodedText);
        if (parsed && parsed.sessionId) {
            return {
                sessionId: parsed.sessionId,
                token: parsed.token || null
            };
        }
    } catch (e) {
        // Fallback for legacy QR payloads that contain only session ID.
    }

    return {
        sessionId: decodedText,
        token: null
    };
}

async function setupQRCheckin() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('scan') === 'true' && urlParams.get('session')) {
        currentSessionId = urlParams.get('session');
        currentQrToken = urlParams.get('token') || null;
        await fetchSessionById(currentSessionId, currentQrToken);
    }
}

document.getElementById('startScanBtn').addEventListener('click', startScanner);
document.getElementById('stopScanBtn').addEventListener('click', stopScanner);

async function startScanner() {
    document.getElementById('scan-options').style.display = 'none';
    document.getElementById('scannerContainer').style.display = 'block';
    document.getElementById('stopScanBtn').style.display = 'inline-block';
    document.getElementById('sessionInfo').style.display = 'none';
    document.getElementById('checkinMessage').innerHTML = '';

    const readerDiv = document.getElementById('reader');
    readerDiv.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;"><div style="font-size: 32px;">⏳</div><p>Starting camera...</p></div>';
    readerDiv.style.display = 'block';

    try {
        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('QR scanner library not loaded. Please check your internet connection and refresh the page.');
        }

        html5QrCode = new Html5Qrcode("reader");
        
        await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            async (decodedText) => {
                const parsed = parseScannedQRPayload(decodedText);
                const scanSignature = `${parsed.sessionId}:${parsed.token || ''}`;

                if (scanSignature !== lastScannedSession) {
                    lastScannedSession = scanSignature;
                    await stopScanner();
                    currentSessionId = parsed.sessionId;
                    currentQrToken = parsed.token;
                    await fetchSessionById(parsed.sessionId, parsed.token);
                }
            },
            (errorMessage) => {
                // console.error(errorMessage);
            }
        );

    } catch (err) {
        console.error('Camera error:', err);
        const errorMsg = err.message || String(err);
        
        let helpfulMsg = `Failed to start camera. Error: ${errorMsg}`;
        let suggestions = [];
        
        if (errorMsg.includes('Permission denied') || errorMsg.includes('NotAllowedError') || errorMsg.includes('NotFoundError')) {
            helpfulMsg = 'Camera permission was denied.';
            suggestions = [
                'Please allow camera access in your browser settings.',
                'Click the camera icon in your browser address bar and select "Allow".',
                'Refresh the page and try again.'
            ];
        } else if (errorMsg.includes('not found')) {
            helpfulMsg = 'No camera found on this device.';
            suggestions = [
                'Please ensure a camera is connected and enabled.',
                'If you are on a laptop, make sure the webcam is not covered.',
                'Try using the manual entry option instead.'
            ];
        }
        
        readerDiv.innerHTML = `<div style="text-align: center; padding: 20px; color: #e74c3c;">
            <h4>⚠️ ${helpfulMsg}</h4>
            <ul style="text-align: left; margin-top: 10px; padding-left: 20px;">
                ${suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>`;
        
        stopScanner();
    }
}

async function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        try {
            await html5QrCode.stop();
        } catch(e) {
            console.error("Error stopping scanner", e);
        }
    }
    html5QrCode = null;
    document.getElementById('scannerContainer').style.display = 'none';
    document.getElementById('stopScanBtn').style.display = 'none';
    document.getElementById('scan-options').style.display = 'flex';
}

async function stopScanner() {
    if (scannerInterval) {
        clearInterval(scannerInterval);
        scannerInterval = null;
    }
    lastScannedSession = null;
    
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            html5QrCode = null;
        } catch (err) {
            console.log('Error stopping scanner:', err);
            html5QrCode = null;
        }
    }
    document.getElementById('scannerContainer').style.display = 'none';
    document.getElementById('scanSection').style.display = 'block';
    document.getElementById('reader').innerHTML = '';
}

async function showManualEntry() {
    // Stop camera if running
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            html5QrCode = null;
        } catch(e) {}
    }
    
    document.getElementById('scanSection').style.display = 'none';
    document.getElementById('scannerContainer').style.display = 'none';
    document.getElementById('manualSection').style.display = 'block';
    document.getElementById('sessionInfo').style.display = 'none';
    document.getElementById('checkinMessage').innerHTML = '';
    document.getElementById('reader').innerHTML = '';
}

function showScanSection() {
    document.getElementById('manualSection').style.display = 'none';
    document.getElementById('scannerContainer').style.display = 'none';
    document.getElementById('scanSection').style.display = 'block';
    document.getElementById('sessionInfo').style.display = 'none';
    document.getElementById('checkinMessage').innerHTML = '';
    document.getElementById('reader').innerHTML = '';
}

async function fetchSession() {
    const sessionId = document.getElementById('checkinCode').value.trim();
    if (!sessionId) {
        alert('Please enter a session ID');
        return;
    }
    currentQrToken = null;
    await fetchSessionById(sessionId);
}

async function fetchSessionById(sessionId, qrToken = null) {
    try {
        const tokenQuery = qrToken ? `?token=${encodeURIComponent(qrToken)}` : '';
        const response = await api.get(`/qr/checkin/${sessionId}${tokenQuery}`);
        
        if (response.expired) {
            document.getElementById('checkinMessage').innerHTML = `
                <div class="error-message">
                    <p>This QR code has expired. Please ask your faculty for a new one.</p>
                </div>
            `;
            return;
        }

        currentSessionId = sessionId;
    currentQrToken = qrToken;
        document.getElementById('scanSection').style.display = 'none';
        document.getElementById('manualSection').style.display = 'none';
        document.getElementById('scannerContainer').style.display = 'none';
        document.getElementById('sessionInfo').style.display = 'block';

        document.getElementById('sessionClassName').textContent = response.session.className;
        document.getElementById('sessionSubjectName').textContent = response.session.subjectName;
        document.getElementById('sessionFacultyName').textContent = response.session.facultyName;
        document.getElementById('sessionPeriod').textContent = response.session.period;
        document.getElementById('sessionDate').textContent = new Date(response.session.date).toLocaleDateString();
        document.getElementById('sessionExpires').textContent = new Date(response.session.expiresAt).toLocaleTimeString();

        const statusEl = document.getElementById('sessionStatus');
        statusEl.innerHTML = '<p class="status-active">Session is active</p>';

        document.getElementById('checkinBtn').style.display = 'inline-block';
        document.getElementById('checkinMessage').innerHTML = '';

    } catch (error) {
        document.getElementById('checkinMessage').innerHTML = `
            <div class="error-message">
                <p>${error.message}</p>
            </div>
        `;
    }
}

async function submitQRCheckin() {
    if (!currentSessionId) {
        alert('No session selected');
        return;
    }

    try {
        const result = await api.post('/qr/submit', {
            sessionId: currentSessionId,
            qrToken: currentQrToken
        });
        
        document.getElementById('sessionStatus').innerHTML = `
            <div class="success-message">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <p><strong>Checked In Successfully!</strong></p>
                <p>${escapeHtml(result.attendance.subjectName)} - ${escapeHtml(result.attendance.className)}</p>
                <p>Period: ${escapeHtml(result.attendance.period)}</p>
            </div>
        `;
        document.getElementById('checkinBtn').style.display = 'none';
        
    } catch (error) {
        document.getElementById('sessionStatus').innerHTML = `
            <div class="error-message">
                <p>${escapeHtml(error.message)}</p>
            </div>
        `;
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
            li.className = `schedule-item ${item.isSubstitution ? 'substitution' : ''}`;
            li.innerHTML = `
                <span class="period-time">Period ${escapeHtml(item.period)}</span>
                <span class="subject-name">${escapeHtml(item.subject?.name)}</span>
                <span class="faculty-name">${escapeHtml(item.faculty?.name)} ${item.isSubstitution ? '(substitute)' : ''}</span>
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




