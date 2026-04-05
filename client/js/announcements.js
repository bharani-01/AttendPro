let currentUser = null;
let availableClasses = [];
let announcementAnalyticsCache = new Map();

const TEMPLATE_CONTENT = {
    marks: {
        title: 'Marks Updated',
        content: 'Your latest marks have been updated. Please check the marks section for subject-wise scores.'
    },
    assignment: {
        title: 'Assignment Due Reminder',
        content: 'Reminder: Please submit your assignment before the deadline mentioned by faculty. Late submissions may not be accepted.'
    },
    holiday: {
        title: 'Holiday Notice',
        content: 'This is to inform you that classes will remain closed as per the holiday schedule. Regular classes will resume on the next working day.'
    },
    exam: {
        title: 'Exam Alert',
        content: 'Upcoming exam schedule has been announced. Prepare accordingly and check timetable/notice sections for detailed timing.'
    }
};

const NAV_ITEMS = {
    admin: [
        { href: 'admin-dashboard.html', label: 'Dashboard', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
        { href: 'admin-dashboard.html?page=students', label: 'Students', icon: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/>' },
        { href: 'admin-dashboard.html?page=faculty', label: 'Faculty', icon: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>' },
        { href: 'admin-dashboard.html?page=classes', label: 'Classes', icon: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>' },
        { href: 'admin-dashboard.html?page=departments', label: 'Departments', icon: '<path d="M3 7h18"/><path d="M3 12h18"/><path d="M3 17h18"/>' },
        { href: 'admin-dashboard.html?page=subjects', label: 'Subjects', icon: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>' },
        { href: 'admin-dashboard.html?page=timetable', label: 'Timetable', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
        { href: 'admin-dashboard.html?page=reports', label: 'Reports', icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
        { href: 'admin-exams.html', label: 'Exams & Marks', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' },
        { href: 'exams.html', label: 'Exam Schedule', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
        { href: 'admin-dashboard.html?page=users', label: 'Manage Users', icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
        { href: 'admin-dashboard.html?page=audit', label: 'Audit Logs', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
        { href: 'admin-dashboard.html?page=security', label: 'Security', icon: '<path d="M12 3l8 4v6c0 5-3.5 8-8 8s-8-3-8-8V7l8-4z"/><path d="M9 12l2 2 4-4"/>' },
        { href: 'admin-dashboard.html?page=settings', label: 'Settings', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15a1.65 1.65 0 0 0-1.51-1H3.4a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 5 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9.32 3h.18A1.65 1.65 0 0 0 11 1.49V1.4a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 16 3h.18a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20 8v.18A1.65 1.65 0 0 0 21.51 10h.09a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 20 15z"/>' },
        { href: 'announcements.html', label: 'Announcements', active: true, icon: '<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>' },
        { href: 'messages.html', label: 'Messages', icon: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' }
    ],
    faculty: [
        { href: 'faculty-dashboard.html', label: 'Dashboard', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
        { href: 'faculty-dashboard.html?page=timetable', label: 'My Timetable', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
        { href: 'faculty-dashboard.html?page=mark', label: 'Mark Attendance', icon: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>' },
        { href: 'faculty-dashboard.html?page=history', label: 'Attendance History', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
        { href: 'faculty-dashboard.html?page=qrcode', label: 'QR Code Check-in', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
        { href: 'faculty-dashboard.html?page=analytics', label: 'Analytics', icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
        { href: 'faculty-dashboard.html?page=leaves', label: 'Leave Requests', icon: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' },
        { href: 'faculty-marks.html', label: 'Enter Marks', icon: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>' },
        { href: 'exams.html', label: 'Exam Schedule', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
        { href: 'announcements.html', label: 'Announcements', active: true, icon: '<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>' },
        { href: 'messages.html', label: 'Messages', icon: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>' }
    ],
    student: [
        { href: 'student-dashboard.html', label: 'Dashboard', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
        { href: 'student-dashboard.html?page=attendance', label: 'My Attendance', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' },
        { href: 'student-dashboard.html?page=daily', label: 'Daily Logs', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
        { href: 'student-dashboard.html?page=timetable', label: 'Timetable', icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
        { href: 'student-dashboard.html?page=leave', label: 'Leave Request', icon: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
        { href: 'student-dashboard.html?page=checkin', label: 'QR Check-in', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
        { href: 'student-marks.html', label: 'My Marks', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' },
        { href: 'exams.html', label: 'Exam Schedule', icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
        { href: 'announcements.html', label: 'Announcements', active: true, icon: '<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>' },
        { href: 'messages.html', label: 'Messages', icon: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' }
    ]
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

function setupUserMenu() {
    const userMenu = document.getElementById('userMenu');
    if (!userMenu) return;

    userMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!userMenu.contains(e.target)) {
            userMenu.classList.remove('active');
        }
    });
}

function setupLogout() {
    const logoutButtons = [document.getElementById('logoutBtn'), document.getElementById('logoutBtnDropdown')];
    logoutButtons.forEach((btn) => {
        if (!btn) return;
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await api.post('/auth/logout', { refreshToken: localStorage.getItem('refreshToken') });
            } catch (_) {
                // Ignore logout API errors and clear local auth anyway
            } finally {
                clearAuth();
                window.location.href = 'login.html';
            }
        });
    });
}

function renderRoleNavigation(role) {
    const menu = document.getElementById('roleNavMenu');
    const badge = document.getElementById('sidebarRoleBadge');
    const items = NAV_ITEMS[role] || NAV_ITEMS.student;

    badge.textContent = role.charAt(0).toUpperCase() + role.slice(1);

    menu.innerHTML = items.map((item) => `
        <li><a href="${item.href}" class="nav-link ${item.active ? 'active' : ''}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
            ${item.label}
        </a></li>
    `).join('') + `
        <li><a href="#" class="nav-link logout" id="logoutBtn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
        </a></li>
    `;
}

function setStatus(message, type = 'info') {
    const status = document.getElementById('announcementStatus');
    if (!status) return;

    status.className = `announcement-status ${type}`;
    status.textContent = message;
    status.style.display = message ? 'block' : 'none';
}

function getCheckedTargetRoles() {
    const checked = Array.from(document.querySelectorAll('input[name="targetRoles"]:checked')).map((el) => el.value);
    if (!checked.length) return ['all'];
    if (checked.includes('all')) return ['all'];
    return checked;
}

function configureComposerForRole() {
    const panel = document.getElementById('adminAnnouncementPanel');
    const title = document.getElementById('composerTitle');
    const note = document.getElementById('composerNote');
    const hint = document.getElementById('targetRolesHint');
    const classHint = document.getElementById('targetClassHint');
    const classSelect = document.getElementById('announcementTargetClass');
    const roleInputs = Array.from(document.querySelectorAll('input[name="targetRoles"]'));

    if (!panel || !title || !note || !hint || !classHint || !classSelect) return false;

    if (currentUser.role !== 'admin' && currentUser.role !== 'faculty') {
        panel.style.display = 'none';
        return false;
    }

    panel.style.display = 'block';

    if (currentUser.role === 'faculty') {
        title.textContent = 'Send Announcement To Your Students';
        note.textContent = 'Use this for marks updates, reminders, and custom class messages. It is sent only to your assigned class students.';
        hint.textContent = 'Faculty announcements are restricted to students in your class.';
        classHint.textContent = 'Faculty posts are always sent to your assigned class.';

        roleInputs.forEach((input) => {
            input.checked = input.value === 'student';
            input.disabled = input.value !== 'student';
        });

        classSelect.disabled = true;
        const assignedClassId = typeof currentUser.assignedClass === 'object'
            ? currentUser.assignedClass?._id
            : currentUser.assignedClass;
        if (assignedClassId) {
            const assignedClass = availableClasses.find((c) => String(c._id) === String(assignedClassId));
            classSelect.innerHTML = `<option value="${assignedClassId}">${escapeHtml(assignedClass?.className || 'My Class')}</option>`;
            classSelect.value = assignedClassId;
        } else {
            classSelect.innerHTML = '<option value="">No assigned class</option>';
        }
    } else {
        title.textContent = 'Create Announcement';
        note.textContent = 'Send institute-wide updates, deadlines, and notices to selected roles.';
        hint.textContent = 'Select one or more roles. Choosing All overrides other role selections.';
        classHint.textContent = 'Pick a class to target only that class. Leave empty for all classes.';

        roleInputs.forEach((input) => {
            input.disabled = false;
            if (input.value === 'all') input.checked = true;
        });

        classSelect.disabled = false;
        classSelect.innerHTML = '<option value="">All Classes</option>' +
            availableClasses.map((c) => `<option value="${c._id}">${escapeHtml(c.className)}</option>`).join('');
    }

    const templateBar = document.getElementById('announcementTemplateBar');
    if (templateBar) {
        templateBar.style.display = (currentUser.role === 'admin' || currentUser.role === 'faculty') ? 'flex' : 'none';
    }

    return true;
}

async function loadClassesForComposer() {
    try {
        const response = await api.get('/classes');
        availableClasses = Array.isArray(response?.classes) ? response.classes : [];
    } catch (_) {
        availableClasses = [];
    }
}

function renderAnnouncements(announcements) {
    const list = document.getElementById('announcementList');
    if (!list) return;

    if (!Array.isArray(announcements) || !announcements.length) {
        list.innerHTML = '<div class="announcement-empty">No announcements available right now.</div>';
        return;
    }

    list.innerHTML = announcements.map((ann) => {
        const createdAt = ann.createdAt ? formatDateTime(ann.createdAt) : '-';
        const expiresAt = ann.expiresAt ? formatDateTime(ann.expiresAt) : 'No expiry';
        const roles = (ann.targetRoles || ['all']).join(', ');

        return `
            <article class="announcement-card">
                <div class="announcement-card-top">
                    <h4>${escapeHtml(ann.title)}</h4>
                    <div class="announcement-card-actions">
                        ${(currentUser.role === 'admin' || currentUser.role === 'faculty') ? `<button class="btn btn-secondary btn-small" onclick="toggleAnnouncementAnalytics('${ann._id}')">Analytics</button>` : ''}
                        ${(currentUser.role === 'admin' || String(ann.createdBy?._id || '') === String(currentUser._id)) ? `<button class="btn btn-danger btn-small" onclick="deleteAnnouncement('${ann._id}')">Delete</button>` : ''}
                    </div>
                </div>
                <p class="announcement-card-content">${escapeHtml(ann.content)}</p>
                <div class="announcement-card-meta">
                    <span>Posted by ${escapeHtml(ann.createdBy?.name || 'Unknown')}</span>
                    <span>${createdAt}</span>
                    ${(currentUser.role === 'admin' || currentUser.role === 'faculty') ? `<span>Roles: ${escapeHtml(roles)}</span><span>Expires: ${escapeHtml(expiresAt)}</span>` : ''}
                    ${ann.targetClass?.className ? `<span>Class: ${escapeHtml(ann.targetClass.className)}</span>` : ''}
                </div>
                <div id="analytics-${ann._id}" class="announcement-analytics-panel" style="display:none;"></div>
            </article>
        `;
    }).join('');
}

function renderAnalyticsSummary(announcements) {
    const summary = document.getElementById('announcementAnalyticsSummary');
    if (!summary) return;

    if (currentUser.role !== 'admin' && currentUser.role !== 'faculty') {
        summary.style.display = 'none';
        return;
    }

    summary.innerHTML = `
        <div class="analytics-summary-item"><strong>${announcements.length}</strong><span>Announcements in view</span></div>
        <div class="analytics-summary-item"><strong>Read Analytics</strong><span>Use Analytics button on each card</span></div>
    `;
    summary.style.display = 'grid';
}

function renderAnalyticsPanel(analytics) {
    const rows = (analytics.classWise || []).map((row) => `
        <tr>
            <td>${escapeHtml(row.className)}</td>
            <td>${row.read}/${row.total}</td>
            <td>${row.unseen}</td>
            <td>${row.readPercentage}%</td>
        </tr>
    `).join('');

    return `
        <div class="announcement-analytics-kpis">
            <div class="analytics-kpi"><span>Total Targets</span><strong>${analytics.totalTargets}</strong></div>
            <div class="analytics-kpi"><span>Read</span><strong>${analytics.readCount}</strong></div>
            <div class="analytics-kpi"><span>Unseen</span><strong>${analytics.unseenCount}</strong></div>
            <div class="analytics-kpi"><span>Read %</span><strong>${analytics.readPercentage}%</strong></div>
        </div>
        ${(analytics.classWise || []).length ? `
            <div class="announcement-analytics-table-wrap">
                <table class="announcement-analytics-table">
                    <thead>
                        <tr>
                            <th>Class</th>
                            <th>Read</th>
                            <th>Unseen</th>
                            <th>Read %</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        ` : '<div class="announcement-analytics-empty">No class-wise student data for this announcement.</div>'}
    `;
}

async function toggleAnnouncementAnalytics(announcementId) {
    const panel = document.getElementById(`analytics-${announcementId}`);
    if (!panel) return;

    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    panel.innerHTML = '<div class="announcement-analytics-loading">Loading analytics...</div>';

    try {
        let analytics = announcementAnalyticsCache.get(announcementId);
        if (!analytics) {
            const response = await api.get(`/announcements/${announcementId}/analytics`);
            analytics = response?.analytics;
            announcementAnalyticsCache.set(announcementId, analytics);
        }
        panel.innerHTML = renderAnalyticsPanel(analytics || {});
    } catch (error) {
        panel.innerHTML = `<div class="announcement-analytics-error">${escapeHtml(error.message || 'Failed to load analytics')}</div>`;
    }
}

async function loadAnnouncements() {
    setStatus('Loading announcements...');
    try {
        const endpoint = currentUser.role === 'admin'
            ? '/announcements/all'
            : (currentUser.role === 'faculty' ? '/announcements?includeSeen=true' : '/announcements');
        const response = await api.get(endpoint);
        const announcements = response.announcements || [];
        renderAnnouncements(announcements);
        renderAnalyticsSummary(announcements);
        setStatus('');
    } catch (error) {
        setStatus(error.message || 'Failed to load announcements', 'error');
    }
}

async function createAnnouncement(e) {
    e.preventDefault();

    const title = document.getElementById('announcementTitle').value.trim();
    const content = document.getElementById('announcementContent').value.trim();
    const expiresAt = document.getElementById('announcementExpiresAt').value;
    const targetRoles = currentUser.role === 'faculty' ? ['student'] : getCheckedTargetRoles();
    const classSelect = document.getElementById('announcementTargetClass');
    const selectedClassId = classSelect?.value || '';

    if (!title || !content) {
        setStatus('Title and content are required.', 'error');
        return;
    }

    try {
        setStatus('Publishing announcement...');
        await api.post('/announcements', {
            title,
            content,
            targetRoles,
            targetClassId: selectedClassId || null,
            expiresAt: expiresAt || null
        });

        document.getElementById('announcementForm').reset();
        if (currentUser.role === 'admin') {
            const allCheckbox = document.querySelector('input[name="targetRoles"][value="all"]');
            if (allCheckbox) allCheckbox.checked = true;
        }

        setStatus('Announcement published successfully.', 'success');
        announcementAnalyticsCache = new Map();
        await loadAnnouncements();
    } catch (error) {
        setStatus(error.message || 'Failed to publish announcement', 'error');
    }
}

async function deleteAnnouncement(id) {
    if (!confirm('Delete this announcement?')) return;

    try {
        setStatus('Deleting announcement...');
        await api.delete(`/announcements/${id}`);
        setStatus('Announcement deleted.', 'success');
        announcementAnalyticsCache.delete(id);
        await loadAnnouncements();
    } catch (error) {
        setStatus(error.message || 'Failed to delete announcement', 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = checkAuth();
    if (!currentUser) return;

    try {
        const profile = await api.get('/auth/profile');
        if (profile?.user) {
            currentUser = profile.user;
            setAuth(localStorage.getItem('token'), currentUser, localStorage.getItem('refreshToken'));
        }
    } catch (_) {
        // Continue with cached user if profile refresh fails
    }

    renderRoleNavigation(currentUser.role);
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('headerUserRole').textContent = currentUser.role;

    setupUserMenu();
    setupLogout();

    await loadClassesForComposer();

    const hasComposer = configureComposerForRole();
    if (hasComposer) {
        document.getElementById('announcementForm').addEventListener('submit', createAnnouncement);
    }

    const templateButtons = Array.from(document.querySelectorAll('.template-chip'));
    templateButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const key = button.getAttribute('data-template');
            const template = TEMPLATE_CONTENT[key];
            if (!template) return;

            const titleInput = document.getElementById('announcementTitle');
            const contentInput = document.getElementById('announcementContent');
            if (titleInput && !titleInput.value.trim()) {
                titleInput.value = template.title;
            } else if (titleInput) {
                titleInput.value = template.title;
            }
            if (contentInput) {
                contentInput.value = template.content;
                contentInput.focus();
            }
        });
    });

    document.getElementById('refreshAnnouncementsBtn').addEventListener('click', loadAnnouncements);
    await loadAnnouncements();
});

window.toggleSidebar = toggleSidebar;
window.deleteAnnouncement = deleteAnnouncement;
window.toggleAnnouncementAnalytics = toggleAnnouncementAnalytics;
