function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

function setupLogout() {
    const btn = document.getElementById('logoutBtn');
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await api.post('/auth/logout'); } catch (_) {}
        clearAuth();
        window.location.href = 'login.html';
    });
}

function normalizeExamType(value) {
    return String(value || '').trim().toLowerCase();
}

function formatMarkValue(value) {
    if (!Number.isFinite(Number(value))) return '-';
    const n = Number(value);
    return Number.isInteger(n) ? String(n) : String(n);
}

function getDisplayedMark(row) {
    if (!row || !row.exam) return null;
    const marksType = String(row.exam.marksType || '').toLowerCase();
    if (marksType === 'internal') {
        return row.internalMarksObtained;
    }
    return row.marksObtained;
}

function buildSubjectRows(rows) {
    const grouped = new Map();

    rows.forEach((row) => {
        const examType = normalizeExamType(row?.exam?.examType);
        if (!['ca1', 'ca2', 'ca3'].includes(examType)) return;

        const subjectId = String(row?.subject?._id || row?.subject?.subjectCode || row?.subject?.subjectName || row?._id || 'subject');
        const subjectName = row?.subject?.subjectName || '-';

        if (!grouped.has(subjectId)) {
            grouped.set(subjectId, {
                subjectName,
                ca1: null,
                ca2: null,
                ca3: null
            });
        }

        const entry = grouped.get(subjectId);
        const markValue = getDisplayedMark(row);

        if (examType === 'ca1') entry.ca1 = markValue;
        if (examType === 'ca2') entry.ca2 = markValue;
        if (examType === 'ca3') entry.ca3 = markValue;
    });

    return Array.from(grouped.values());
}

function renderMarks(rows) {
    const tbody = document.querySelector('#myMarksTable tbody');
    if (!tbody) return;

    const subjectRows = buildSubjectRows(Array.isArray(rows) ? rows : []);
    if (!subjectRows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">No CA marks available yet</td></tr>';
        return;
    }

    tbody.innerHTML = subjectRows.map((row) => `
        <tr>
            <td>${row.subjectName}</td>
            <td>${formatMarkValue(row.ca1)}</td>
            <td>${formatMarkValue(row.ca2)}</td>
            <td>${formatMarkValue(row.ca3)}</td>
        </tr>
    `).join('');
}

async function loadMyMarks() {
    const data = await api.get('/marks/student/me');
    renderMarks(data.marks || []);
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user || user.role !== 'student') return;

    setupLogout();

    try {
        await loadMyMarks();
    } catch (error) {
        alert(error.message || 'Failed to load marks');
    }
});
