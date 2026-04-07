let currentUser = null;
let availableClasses = [];
let classSubjectsMap = new Map();
let draftRows = [];
let nextDraftRowId = 1;
let dragRowId = null;
let dragClassId = null;
const EXAM_DRAFT_STORAGE_PREFIX = 'examScheduleDraftV1';
const EXAM_STAGE_PAGES = {
    scheduling: 'exams.html',
    preview: 'exams-preview.html',
    confirm: 'exams-confirm.html'
};

const NAV_ICONS = {
    dashboard: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    students: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>',
    faculty: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    classes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
    departments: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"/><path d="M3 12h18"/><path d="M3 17h18"/></svg>',
    subjects: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    timetable: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    reports: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    marks: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    schedule: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    users: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    audit: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    security: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4v6c0 5-3.5 8-8 8s-8-3-8-8V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>',
    settings: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15a1.65 1.65 0 0 0-1.51-1H3.4a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 5 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9.32 3h.18A1.65 1.65 0 0 0 11 1.49V1.4a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 16 3h.18a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20 8v.18A1.65 1.65 0 0 0 21.51 10h.09a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 20 15z"/></svg>',
    attendance: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    daily: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    leave: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    qrcode: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    analytics: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    history: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    announcements: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    messages: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    logout: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

const NAV_ITEMS = {
    admin: [
        { href: 'admin-dashboard.html', label: 'Dashboard', icon: 'dashboard' },
        { href: 'admin-dashboard.html?page=students', label: 'Students', icon: 'students' },
        { href: 'admin-dashboard.html?page=faculty', label: 'Faculty', icon: 'faculty' },
        { href: 'admin-dashboard.html?page=classes', label: 'Classes', icon: 'classes' },
        { href: 'admin-dashboard.html?page=departments', label: 'Departments', icon: 'departments' },
        { href: 'admin-dashboard.html?page=subjects', label: 'Subjects', icon: 'subjects' },
        { href: 'admin-dashboard.html?page=timetable', label: 'Timetable', icon: 'timetable' },
        { href: 'admin-dashboard.html?page=reports', label: 'Reports', icon: 'reports' },
        { href: 'admin-exams.html', label: 'Exams & Marks', icon: 'marks' },
        { href: 'exams.html', label: 'Exam Schedule', icon: 'schedule', active: true },
        { href: 'admin-dashboard.html?page=users', label: 'Manage Users', icon: 'users' },
        { href: 'admin-dashboard.html?page=audit', label: 'Audit Logs', icon: 'audit' },
        { href: 'admin-dashboard.html?page=security', label: 'Security', icon: 'security' },
        { href: 'admin-dashboard.html?page=settings', label: 'Settings', icon: 'settings' },
        { href: 'messages.html', label: 'Messages', icon: 'messages' },
        { href: 'announcements.html', label: 'Announcements', icon: 'announcements' }
    ],
    faculty: [
        { href: 'faculty-dashboard.html', label: 'Dashboard', icon: 'dashboard' },
        { href: 'faculty-dashboard.html?page=timetable', label: 'My Timetable', icon: 'timetable' },
        { href: 'faculty-dashboard.html?page=mark', label: 'Mark Attendance', icon: 'marks' },
        { href: 'faculty-dashboard.html?page=history', label: 'Attendance History', icon: 'history' },
        { href: 'faculty-dashboard.html?page=qrcode', label: 'QR Code Check-in', icon: 'qrcode' },
        { href: 'faculty-dashboard.html?page=analytics', label: 'Analytics', icon: 'analytics' },
        { href: 'faculty-dashboard.html?page=leaves', label: 'Leave Requests', icon: 'leave' },
        { href: 'faculty-marks.html', label: 'Enter Marks', icon: 'marks' },
        { href: 'exams.html', label: 'Exam Schedule', icon: 'schedule', active: true },
        { href: 'announcements.html', label: 'Announcements', icon: 'announcements' },
        { href: 'messages.html', label: 'Messages', icon: 'messages' }
    ],
    student: [
        { href: 'student-dashboard.html', label: 'Dashboard', icon: 'dashboard' },
        { href: 'student-dashboard.html?page=attendance', label: 'My Attendance', icon: 'attendance' },
        { href: 'student-dashboard.html?page=daily', label: 'Daily Logs', icon: 'daily' },
        { href: 'student-dashboard.html?page=timetable', label: 'Timetable', icon: 'timetable' },
        { href: 'student-dashboard.html?page=leave', label: 'Leave Request', icon: 'leave' },
        { href: 'student-dashboard.html?page=checkin', label: 'QR Check-in', icon: 'qrcode' },
        { href: 'student-marks.html', label: 'My Marks', icon: 'marks' },
        { href: 'exams.html', label: 'Exam Schedule', icon: 'schedule', active: true },
        { href: 'announcements.html', label: 'Announcements', icon: 'announcements' },
        { href: 'messages.html', label: 'Messages', icon: 'messages' }
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

function setStatus(message, type = 'info') {
    const status = document.getElementById('examStatus');
    if (!status) return;

    status.className = `announcement-status ${type}`;
    status.textContent = message;
    status.style.display = message ? 'block' : 'none';
}

function getCurrentExamStage() {
    return document.body?.dataset?.examStage || 'scheduling';
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
                // ignore
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
        <li>
            <a href="${item.href}" class="nav-link ${item.active ? 'active' : ''}">
                ${NAV_ICONS[item.icon] || ''}
                <span class="nav-link-label">${item.label}</span>
            </a>
        </li>
    `).join('') + `
        <li>
            <a href="#" class="nav-link logout" id="logoutBtn">
                ${NAV_ICONS.logout}
                <span class="nav-link-label">Logout</span>
            </a>
        </li>
    `;
}

async function loadClasses() {
    const response = await api.get('/classes');
    availableClasses = Array.isArray(response?.classes) ? response.classes : [];

    const classSelect = document.getElementById('examClassSelect');
    if (!classSelect) return;

    classSelect.innerHTML = '<option value="">Select class</option>' +
        availableClasses.map((c) => `<option value="${c._id}">${escapeHtml(c.className)}</option>`).join('');
}

async function loadSubjectsForClass(classId) {
    if (!classId) {
        return;
    }

    if (!classSubjectsMap.has(classId)) {
        const response = await api.get(`/classes/${classId}/subjects`);
        const subjects = Array.isArray(response?.subjects) ? response.subjects : [];
        classSubjectsMap.set(classId, subjects);
    }
}

function getClassNameById(classId) {
    return availableClasses.find((c) => String(c._id) === String(classId))?.className || 'Unknown Class';
}

function getSubjectNameById(classId, subjectId) {
    const subjects = classSubjectsMap.get(classId) || [];
    return subjects.find((s) => String(s._id) === String(subjectId))?.subjectName || 'Unknown Subject';
}

function addDays(dateString, days) {
    const base = new Date(dateString);
    if (Number.isNaN(base.getTime())) return '';
    base.setDate(base.getDate() + days);
    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDraftStorageKey() {
    const userId = String(currentUser?._id || currentUser?.id || 'anonymous');
    return `${EXAM_DRAFT_STORAGE_PREFIX}:${userId}`;
}

function persistDraftToStorage(stage = 'draft') {
    if (currentUser?.role !== 'admin') return;

    const storageKey = getDraftStorageKey();
    if (!draftRows.length) {
        localStorage.removeItem(storageKey);
        return;
    }

    const payload = {
        version: 1,
        stage,
        savedAt: new Date().toISOString(),
        nextDraftRowId,
        rows: draftRows
    };

    try {
        localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (_) {
        // ignore storage quota or private mode issues
    }
}

async function restoreDraftFromStorage() {
    if (currentUser?.role !== 'admin') return;

    const storageKey = getDraftStorageKey();
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (_) {
        localStorage.removeItem(storageKey);
        return;
    }

    const savedRows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    if (!savedRows.length) {
        localStorage.removeItem(storageKey);
        return;
    }

    const validClassIds = new Set(availableClasses.map((c) => String(c._id)));
    const uniqueClassIds = [...new Set(savedRows.map((row) => String(row.classId)).filter((id) => validClassIds.has(id)))];
    await Promise.all(uniqueClassIds.map((classId) => loadSubjectsForClass(classId)));

    const restoredRows = savedRows
        .map((row) => {
            const classId = String(row.classId || '');
            if (!validClassIds.has(classId)) return null;

            const subjects = classSubjectsMap.get(classId) || [];
            const subjectId = String(row.subjectId || '');
            const subject = subjects.find((item) => String(item._id) === subjectId);
            if (!subject) return null;

            return {
                rowId: Number(row.rowId) || 0,
                classId,
                className: getClassNameById(classId),
                subjectId,
                subjectName: subject.subjectName,
                examTitle: String(row.examTitle || 'Exam').trim() || 'Exam',
                examDate: String(row.examDate || ''),
                examSection: ['Morning', 'Afternoon', 'Evening'].includes(row.examSection) ? row.examSection : 'Morning',
                manualDate: Boolean(row.manualDate)
            };
        })
        .filter(Boolean);

    if (!restoredRows.length) {
        localStorage.removeItem(storageKey);
        return;
    }

    draftRows = restoredRows;
    nextDraftRowId = Math.max(...restoredRows.map((row) => Number(row.rowId) || 0), 0) + 1;
    renderDraftRows();
    setStatus('Restored your saved draft plan.', 'info');
}

async function addClassSubjectsToDraft(classId) {
    if (!classId) return;

    if (draftRows.some((row) => String(row.classId) === String(classId))) {
        setStatus('This class is already in draft plan.', 'info');
        return;
    }

    await loadSubjectsForClass(classId);
    const subjects = classSubjectsMap.get(classId) || [];
    if (!subjects.length) {
        setStatus('No subjects found for selected class.', 'error');
        return;
    }

    const examTitle = document.getElementById('examTitleInput').value.trim() || 'Exam';
    const examDate = document.getElementById('examDateInput').value;
    const examSection = document.getElementById('examSectionSelect').value;

    if (!examDate) {
        setStatus('Select the first exam date before adding a class.', 'error');
        return;
    }

    const className = getClassNameById(classId);
    const newRows = subjects.map((subject, index) => ({
        rowId: nextDraftRowId++,
        classId,
        className,
        subjectId: String(subject._id),
        subjectName: subject.subjectName,
        examTitle,
        examDate: addDays(examDate, index),
        examSection,
        manualDate: false
    }));

    draftRows = [...draftRows, ...newRows];
    renderDraftRows();
    persistDraftToStorage('draft');
    setStatus(`Added ${newRows.length} subjects for ${className}.`, 'success');
}

function applyDateCascadeFromFirst(classId, firstDate) {
    const classRows = draftRows.filter((row) => String(row.classId) === String(classId));
    classRows.forEach((row, index) => {
        if (index === 0) {
            row.examDate = firstDate;
            return;
        }

        if (!row.manualDate) {
            row.examDate = addDays(firstDate, index);
        }
    });
}

function updateDraftRow(rowId, field, value) {
    const row = draftRows.find((item) => item.rowId === rowId);
    if (!row) return;

    if (field === 'examDate') {
        row.examDate = value;

        const classRows = draftRows.filter((r) => String(r.classId) === String(row.classId));
        const rowIndex = classRows.findIndex((r) => r.rowId === rowId);

        if (rowIndex === 0) {
            applyDateCascadeFromFirst(row.classId, value);
        } else {
            row.manualDate = true;
        }
    } else if (field === 'examSection') {
        row.examSection = value;
    } else if (field === 'examTitle') {
        row.examTitle = value;
    }

    renderDraftRows();
    persistDraftToStorage('draft');
}

function removeClassDraft(classId) {
    draftRows = draftRows.filter((row) => String(row.classId) !== String(classId));
    renderDraftRows();
    persistDraftToStorage('draft');
}

function replaceDraftSubject(rowId, subjectId) {
    const row = draftRows.find((item) => item.rowId === rowId);
    if (!row) return;

    const subjectName = getSubjectNameById(row.classId, subjectId);
    if (!subjectId || subjectName === 'Unknown Subject') {
        setStatus('Invalid subject selected.', 'error');
        renderDraftRows();
        return;
    }

    const duplicate = draftRows.some((item) => String(item.classId) === String(row.classId)
        && item.rowId !== row.rowId
        && String(item.subjectId) === String(subjectId));

    if (duplicate) {
        setStatus('This subject already exists in the same class table.', 'error');
        renderDraftRows();
        return;
    }

    row.subjectId = String(subjectId);
    row.subjectName = subjectName;
    renderDraftRows();
    persistDraftToStorage('draft');
}

function startRowDrag(event, rowId, classId) {
    dragRowId = rowId;
    dragClassId = classId;
    if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(rowId));
    }
}

function onRowDragOver(event) {
    event.preventDefault();
    if (event?.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }
}

function onRowDrop(event, targetRowId, targetClassId) {
    event.preventDefault();

    if (!dragRowId || !dragClassId) return;
    if (String(dragClassId) !== String(targetClassId)) return;
    if (Number(dragRowId) === Number(targetRowId)) return;

    const classRows = draftRows.filter((row) => String(row.classId) === String(targetClassId));
    const fromIdx = classRows.findIndex((row) => row.rowId === Number(dragRowId));
    const toIdx = classRows.findIndex((row) => row.rowId === Number(targetRowId));

    if (fromIdx === -1 || toIdx === -1) return;

    const reorderedClassRows = [...classRows];
    const [moved] = reorderedClassRows.splice(fromIdx, 1);
    reorderedClassRows.splice(toIdx, 0, moved);

    const otherRows = draftRows.filter((row) => String(row.classId) !== String(targetClassId));
    const classOrder = [];
    draftRows.forEach((row) => {
        const key = String(row.classId);
        if (!classOrder.includes(key)) classOrder.push(key);
    });

    draftRows = classOrder.flatMap((classKey) => {
        if (String(classKey) === String(targetClassId)) return reorderedClassRows;
        return otherRows.filter((row) => String(row.classId) === String(classKey));
    });

    renderDraftRows();
    persistDraftToStorage('draft');
}

function endRowDrag() {
    dragRowId = null;
    dragClassId = null;
}

function renderDraftRows() {
    const wrap = document.getElementById('examDraftWrap');
    const actions = document.getElementById('examDraftActions');
    const tbody = document.getElementById('draftExamRows');
    const publishPreview = document.getElementById('examPublishPreview');

    if (!tbody || !wrap || !actions) return;

    if (!draftRows.length) {
        tbody.innerHTML = '';
        wrap.style.display = 'none';
        actions.style.display = 'none';
        if (publishPreview) publishPreview.style.display = 'none';
        return;
    }

    const grouped = draftRows.reduce((acc, row) => {
        const key = String(row.classId);
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
    }, {});

    tbody.innerHTML = Object.entries(grouped).map(([classId, rows]) => `
        <div class="exam-class-group" id="draft-group-${classId}" data-draft-class="${classId}">
            <div class="exam-class-group-head">
                <h4>${escapeHtml(rows[0].className)}</h4>
                <button type="button" class="btn btn-danger btn-small" onclick="removeClassDraft('${classId}')">Remove Class</button>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th style="width:36px;">::</th>
                            <th>Subject</th>
                            <th>Exam Name</th>
                            <th>Date</th>
                            <th>Section</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row, index) => `
                            <tr
                                draggable="true"
                                ondragstart="startRowDrag(event, ${row.rowId}, '${classId}')"
                                ondragover="onRowDragOver(event)"
                                ondrop="onRowDrop(event, ${row.rowId}, '${classId}')"
                                ondragend="endRowDrag()"
                                class="exam-draggable-row"
                            >
                                <td class="exam-drag-handle">::</td>
                                <td>
                                    <select onchange="replaceDraftSubject(${row.rowId}, this.value)">
                                        ${(classSubjectsMap.get(classId) || []).map((subject) => `
                                            <option value="${subject._id}" ${String(subject._id) === String(row.subjectId) ? 'selected' : ''}>${escapeHtml(subject.subjectName)}</option>
                                        `).join('')}
                                    </select>
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        value="${escapeHtml(row.examTitle)}"
                                        onchange="updateDraftRow(${row.rowId}, 'examTitle', this.value)"
                                    />
                                </td>
                                <td>
                                    <input
                                        type="date"
                                        value="${escapeHtml(row.examDate)}"
                                        onchange="updateDraftRow(${row.rowId}, 'examDate', this.value)"
                                    />
                                </td>
                                <td>
                                    <select onchange="updateDraftRow(${row.rowId}, 'examSection', this.value)">
                                        <option value="Morning" ${row.examSection === 'Morning' ? 'selected' : ''}>Morning</option>
                                        <option value="Afternoon" ${row.examSection === 'Afternoon' ? 'selected' : ''}>Afternoon</option>
                                        <option value="Evening" ${row.examSection === 'Evening' ? 'selected' : ''}>Evening</option>
                                    </select>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `).join('');

    wrap.style.display = '';
    actions.style.display = 'flex';
}

function clearDraftRows() {
    draftRows = [];
    renderDraftRows();
    persistDraftToStorage('draft');
    setStatus('Draft plan cleared.', 'info');
}

function buildGroupedPreviewHtml() {
    const grouped = draftRows.reduce((acc, row) => {
        const key = String(row.classId);
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
    }, {});

    return Object.entries(grouped).map(([classId, classRows]) => `
        <div class="exam-class-group">
            <div class="exam-class-group-head">
                <h4>${escapeHtml(classRows[0].className)}</h4>
                <button type="button" class="btn btn-secondary btn-small" onclick="editPreviewClass('${classId}')">Edit This Class</button>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Subject</th>
                            <th>Exam Name</th>
                            <th>Date</th>
                            <th>Section</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${classRows.map((row, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${escapeHtml(row.subjectName)}</td>
                                <td>${escapeHtml(row.examTitle)}</td>
                                <td>${escapeHtml(row.examDate)}</td>
                                <td>${escapeHtml(row.examSection)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `).join('');
}

function showPublishPreview() {
    if (!draftRows.length) {
        setStatus('Add at least one exam row before publishing.', 'error');
        return;
    }

    const ok = confirm('Move this draft to Preview Scheduling stage?');
    if (!ok) return;

    persistDraftToStorage('preview');
    window.location.href = EXAM_STAGE_PAGES.preview;
}

function editPreviewClass(classId) {
    persistDraftToStorage('draft');
    window.location.href = `${EXAM_STAGE_PAGES.scheduling}?editClass=${encodeURIComponent(classId)}`;
}

function renderPreviewStagePage() {
    const previewRows = document.getElementById('previewPageRows');
    if (!previewRows) return;

    if (!draftRows.length) {
        previewRows.innerHTML = '<div class="announcement-status error" style="display:block;">No draft available. Please create scheduling draft first.</div>';
        return;
    }

    previewRows.innerHTML = buildGroupedPreviewHtml();
}

function renderConfirmStagePage() {
    const confirmRows = document.getElementById('confirmPageRows');
    const confirmMeta = document.getElementById('confirmMeta');
    if (!confirmRows) return;

    if (!draftRows.length) {
        confirmRows.innerHTML = '<div class="announcement-status error" style="display:block;">No draft available. Please create scheduling draft first.</div>';
        if (confirmMeta) confirmMeta.textContent = '';
        return;
    }

    confirmRows.innerHTML = buildGroupedPreviewHtml();
    if (confirmMeta) {
        const classCount = new Set(draftRows.map((row) => String(row.classId))).size;
        confirmMeta.textContent = `${draftRows.length} exam row(s) across ${classCount} class(es) are ready to publish.`;
    }
}

async function confirmAndPublish() {
    if (!draftRows.length) {
        setStatus('No draft rows available.', 'error');
        return;
    }

    const ok = confirm(`Publish ${draftRows.length} exam schedule row(s)?`);
    if (!ok) return;

    try {
        setStatus('Publishing exam schedule...', 'info');
        const result = await api.post('/exam-schedules/publish-bulk', {
            exams: draftRows.map((row) => ({
                classId: row.classId,
                subjectId: row.subjectId,
                examTitle: row.examTitle,
                examDate: row.examDate,
                examSection: row.examSection
            }))
        });

        const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0;
        setStatus(`Published. Inserted: ${result.insertedCount || 0}, Failed: ${failedCount}`, failedCount ? 'error' : 'success');

        draftRows = [];
        persistDraftToStorage('published');
        renderDraftRows();
        if (getCurrentExamStage() === 'confirm') {
            window.location.href = EXAM_STAGE_PAGES.scheduling;
            return;
        }

        await loadPublishedSchedules();
    } catch (error) {
        setStatus(error.message || 'Failed to publish exam schedule', 'error');
    }
}

async function loadPublishedSchedules() {
    const tbody = document.getElementById('publishedExamRows');
    if (!tbody) return;
    try {
        const response = await api.get('/exam-schedules');
        const schedules = Array.isArray(response?.schedules) ? response.schedules : [];

        if (!schedules.length) {
            tbody.innerHTML = '<tr><td colspan="6">No exam schedules found.</td></tr>';
            return;
        }

        tbody.innerHTML = schedules.map((s) => `
            <tr>
                <td>${new Date(s.examDate).toLocaleDateString()}</td>
                <td>${escapeHtml(s.examSection)}</td>
                <td>${escapeHtml(s.class?.className || '-')}</td>
                <td>${escapeHtml(s.subject?.subjectName || '-')}</td>
                <td>${escapeHtml(s.examTitle || '-')}</td>
                <td>${escapeHtml(s.createdBy?.name || '-')}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message || 'Failed to load schedules')}</td></tr>`;
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
        // fallback to cached auth
    }

    renderRoleNavigation(currentUser.role);

    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('headerUserRole').textContent = currentUser.role;

    setupUserMenu();
    setupLogout();

    const stage = getCurrentExamStage();

    if (currentUser.role === 'admin') {
        const panel = document.getElementById('examAdminPanel');
        if (panel) panel.style.display = 'block';
        await loadClasses();
        await restoreDraftFromStorage();

        if (stage === 'scheduling') {
            const classSelect = document.getElementById('examClassSelect');
            if (classSelect) {
                classSelect.addEventListener('change', async (e) => {
                    await addClassSubjectsToDraft(e.target.value);
                    e.target.value = '';
                });
            }

            const clearBtn = document.getElementById('clearExamDraftBtn');
            if (clearBtn) clearBtn.addEventListener('click', clearDraftRows);

            const previewBtn = document.getElementById('previewPublishBtn');
            if (previewBtn) previewBtn.addEventListener('click', showPublishPreview);

            const editClassId = new URLSearchParams(window.location.search).get('editClass');
            if (editClassId) {
                setTimeout(() => {
                    const target = document.querySelector(`[data-draft-class="${editClassId}"]`);
                    if (!target) return;
                    target.classList.add('exam-edit-focus');
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setTimeout(() => {
                        target.classList.remove('exam-edit-focus');
                    }, 1400);
                }, 100);
            }
        }

        if (stage === 'preview') {
            renderPreviewStagePage();

            const backBtn = document.getElementById('previewBackBtn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    window.location.href = EXAM_STAGE_PAGES.scheduling;
                });
            }

            const continueBtn = document.getElementById('previewContinueBtn');
            if (continueBtn) {
                continueBtn.addEventListener('click', () => {
                    if (!draftRows.length) {
                        setStatus('No draft available to continue.', 'error');
                        return;
                    }

                    const ok = confirm('Continue to final confirmation stage?');
                    if (!ok) return;
                    persistDraftToStorage('confirm');
                    window.location.href = EXAM_STAGE_PAGES.confirm;
                });
            }
        }

        if (stage === 'confirm') {
            renderConfirmStagePage();

            const backBtn = document.getElementById('confirmBackBtn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    window.location.href = EXAM_STAGE_PAGES.preview;
                });
            }

            const publishBtn = document.getElementById('confirmPublishBtn');
            if (publishBtn) {
                publishBtn.addEventListener('click', confirmAndPublish);
            }
        }
    } else {
        const title = document.getElementById('publishedSectionTitle');
        if (title) title.textContent = 'Upcoming Exam Schedule';
    }

    const refreshBtn = document.getElementById('refreshExamScheduleBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadPublishedSchedules);
    await loadPublishedSchedules();
});

window.toggleSidebar = toggleSidebar;
window.updateDraftRow = updateDraftRow;
window.removeClassDraft = removeClassDraft;
window.replaceDraftSubject = replaceDraftSubject;
window.startRowDrag = startRowDrag;
window.onRowDragOver = onRowDragOver;
window.onRowDrop = onRowDrop;
window.endRowDrag = endRowDrag;
window.editPreviewClass = editPreviewClass;
