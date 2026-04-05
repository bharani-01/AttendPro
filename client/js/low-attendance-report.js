let lowAttendanceRows = [];
const failedMailByStudent = new Map();
let currentSendAbortController = null;
let isSendingEmails = false;
const MAIL_PROGRESS_STORAGE_KEY = 'lowAttendanceMailProgress.v1';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getTodayIso() {
    return new Date().toISOString().split('T')[0];
}

function getSelectedStudentIds() {
    const checks = document.querySelectorAll('.row-selector:checked');
    return Array.from(checks).map((el) => el.value);
}

function formatHumanDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function updateCutoffDateDisplay() {
    const cutoffDate = document.getElementById('cutoffDate')?.value;
    const display = document.getElementById('cutoffDateDisplay');
    if (!display) return;
    display.textContent = `Selected: ${formatHumanDate(cutoffDate)}`;
}

function getProgressMap() {
    try {
        const raw = localStorage.getItem(MAIL_PROGRESS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
        return {};
    }
}

function saveProgressMap(map) {
    localStorage.setItem(MAIL_PROGRESS_STORAGE_KEY, JSON.stringify(map || {}));
}

function buildProgressKey(cutoffDate, threshold) {
    return `${cutoffDate || 'no-date'}::${Number(threshold || 75)}`;
}

function getSavedProgress(cutoffDate, threshold) {
    const map = getProgressMap();
    return map[buildProgressKey(cutoffDate, threshold)] || null;
}

function upsertSavedProgress(cutoffDate, threshold, incoming = {}) {
    const map = getProgressMap();
    const key = buildProgressKey(cutoffDate, threshold);
    const current = map[key] || {
        cumulativeSent: 0,
        cumulativeSkipped: 0,
        cumulativeFailed: 0,
        lastUpdated: null
    };

    const next = {
        cumulativeSent: Math.max(0, Number(current.cumulativeSent || 0) + Number(incoming.addSent || 0)),
        cumulativeSkipped: Math.max(0, Number(current.cumulativeSkipped || 0) + Number(incoming.addSkipped || 0)),
        cumulativeFailed: Math.max(0, Number(current.cumulativeFailed || 0) + Number(incoming.addFailed || 0)),
        lastUpdated: incoming.lastUpdated || current.lastUpdated || null,
        overallTotal: Number.isFinite(Number(incoming.overallTotal)) ? Number(incoming.overallTotal) : Number(current.overallTotal || 0),
        overallSent: Number.isFinite(Number(incoming.overallSent)) ? Number(incoming.overallSent) : Number(current.overallSent || 0),
        overallPending: Number.isFinite(Number(incoming.overallPending)) ? Number(incoming.overallPending) : Number(current.overallPending || 0)
    };

    map[key] = next;
    saveProgressMap(map);
    return next;
}

function renderMailRunStatus({ sent = 0, skipped = 0, failed = 0, timestamp = null, errors = [] } = {}) {
    const grid = document.getElementById('mailRunStatusGrid');
    const errList = document.getElementById('mailRunErrors');
    if (!grid || !errList) return;

    grid.innerHTML = `
        <div class="mail-run-item"><strong>Sent:</strong> ${sent}</div>
        <div class="mail-run-item"><strong>Skipped:</strong> ${skipped}</div>
        <div class="mail-run-item"><strong>Failed:</strong> ${failed}</div>
        <div class="mail-run-item"><strong>Updated:</strong> ${timestamp ? formatHumanDate(timestamp) : '-'}</div>
    `;

    if (!errors.length) {
        errList.style.display = 'none';
        errList.innerHTML = '';
        return;
    }

    errList.style.display = 'block';
    errList.innerHTML = errors
        .map((entry) => `<li>${escapeHtml(entry)}</li>`)
        .join('');
}

function renderMailProgressFromSaved(cutoffDate, threshold, fallback = {}) {
    const saved = getSavedProgress(cutoffDate, threshold);
    const runSent = saved ? Number(saved.cumulativeSent || 0) : Number(fallback.sent || 0);
    const runSkipped = saved ? Number(saved.cumulativeSkipped || 0) : Number(fallback.skipped || 0);
    const runFailed = saved ? Number(saved.cumulativeFailed || 0) : Number(fallback.failed || 0);
    const updated = saved?.lastUpdated || fallback.timestamp || null;

    const overallTotal = Number.isFinite(Number(saved?.overallTotal)) ? Number(saved.overallTotal) : Number(fallback.overallTotal || 0);
    const overallSent = Number.isFinite(Number(saved?.overallSent)) ? Number(saved.overallSent) : Number(fallback.overallSent || 0);
    const overallPending = Number.isFinite(Number(saved?.overallPending)) ? Number(saved.overallPending) : Math.max(0, overallTotal - overallSent);

    renderMailRunStatus({
        sent: runSent,
        skipped: runSkipped,
        failed: runFailed,
        timestamp: updated,
        errors: fallback.errors || []
    });

    const grid = document.getElementById('mailRunStatusGrid');
    if (!grid) return;

    grid.insertAdjacentHTML('beforeend', `
        <div class="mail-run-item"><strong>Overall Total:</strong> ${overallTotal}</div>
        <div class="mail-run-item"><strong>Overall Sent:</strong> ${overallSent}</div>
        <div class="mail-run-item"><strong>Overall Pending:</strong> ${overallPending}</div>
    `);
}

function refreshSummary() {
    const total = lowAttendanceRows.length;
    const sent = lowAttendanceRows.filter((r) => r.emailSent).length;
    const pending = total - sent;
    const selected = getSelectedStudentIds().length;

    document.getElementById('summaryTotal').textContent = String(total);
    document.getElementById('summarySent').textContent = String(sent);
    document.getElementById('summaryPending').textContent = String(pending);
    document.getElementById('summarySelected').textContent = String(selected);
}

function setSendingUiState(isSending) {
    isSendingEmails = isSending;

    const sendBtn = document.getElementById('sendEmailsBtn');
    const cancelBtn = document.getElementById('cancelSendBtn');
    const generateBtn = document.getElementById('generateBtn');

    if (sendBtn) {
        sendBtn.disabled = isSending;
        sendBtn.textContent = isSending ? 'Sending...' : 'Send Selected Emails';
    }

    if (cancelBtn) {
        cancelBtn.style.display = isSending ? 'inline-flex' : 'none';
        cancelBtn.disabled = !isSending;
    }

    if (generateBtn) {
        generateBtn.disabled = isSending;
    }
}

function renderTable() {
    const tbody = document.querySelector('#lowAttendanceTable tbody');
    if (!tbody) return;

    if (!lowAttendanceRows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No low attendance records found for this date and threshold</td></tr>';
        refreshSummary();
        return;
    }

    tbody.innerHTML = lowAttendanceRows.map((row) => {
        const canSelect = !row.emailSent;
        const failedReason = failedMailByStudent.get(String(row.studentId));
        const status = failedReason
            ? `<span class="status-pill status-failed" title="${escapeHtml(failedReason)}">Failed</span>`
            : row.emailSent
            ? `<span class="status-pill status-sent">Sent (${new Date(row.sentAt).toLocaleDateString()})</span>`
            : '<span class="status-pill status-pending">Pending</span>';

        return `
            <tr>
                <td>
                    <input
                        type="checkbox"
                        class="row-selector"
                        value="${escapeHtml(row.studentId)}"
                        ${canSelect ? '' : 'disabled'}
                        onchange="refreshSummary()"
                    >
                </td>
                <td>${escapeHtml(row.studentName)}${row.uniqueId ? ` (${escapeHtml(row.uniqueId)})` : ''}</td>
                <td>${escapeHtml(row.recipientEmail)}</td>
                <td>${escapeHtml(row.className || 'Unassigned')}</td>
                <td>${row.totalClasses}</td>
                <td>${row.presentClasses}</td>
                <td class="${row.attendancePercentage < 75 ? 'text-danger' : 'text-success'}">${row.attendancePercentage}%</td>
                <td>${status}</td>
            </tr>
        `;
    }).join('');

    refreshSummary();
}

async function generateReport() {
    const cutoffDate = document.getElementById('cutoffDate').value;
    const threshold = Number(document.getElementById('threshold').value || 75);

    if (!cutoffDate) {
        alert('Please choose a cutoff date');
        return;
    }

    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
        alert('Threshold should be between 1 and 100');
        return;
    }

    const btn = document.getElementById('generateBtn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
        const data = await api.get(`/attendance/low-attendance-report?cutoffDate=${encodeURIComponent(cutoffDate)}&threshold=${encodeURIComponent(String(threshold))}`);
        lowAttendanceRows = Array.isArray(data?.report) ? data.report : [];
        failedMailByStudent.clear();
        renderTable();
        updateCutoffDateDisplay();

        const sentCount = Number(data?.sentCount || 0);
        const total = Number(data?.total || lowAttendanceRows.length || 0);
        const pendingCount = Math.max(0, total - sentCount);

        upsertSavedProgress(cutoffDate, threshold, {
            overallTotal: total,
            overallSent: sentCount,
            overallPending: pendingCount
        });

        renderMailProgressFromSaved(cutoffDate, threshold, {
            overallTotal: total,
            overallSent: sentCount,
            overallPending: pendingCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        alert(error.message || 'Failed to generate low attendance report');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Report';
    }
}

async function sendSelectedEmails() {
    if (isSendingEmails) {
        return;
    }

    const cutoffDate = document.getElementById('cutoffDate').value;
    const threshold = Number(document.getElementById('threshold').value || 75);
    const studentIds = getSelectedStudentIds();

    if (!studentIds.length) {
        alert('Select at least one pending student');
        return;
    }

    const ok = confirm(`Send low attendance emails to ${studentIds.length} selected student(s)?`);
    if (!ok) return;

    setSendingUiState(true);
    currentSendAbortController = new AbortController();

    try {
        const result = await api.request('/attendance/low-attendance-report/send', {
            method: 'POST',
            body: JSON.stringify({
                cutoffDate,
                threshold,
                studentIds,
                confirm: true
            }),
            signal: currentSendAbortController.signal
        });

        const sentCount = Array.isArray(result?.sent) ? result.sent.length : 0;
        const skippedCount = Array.isArray(result?.skipped) ? result.skipped.length : 0;
        const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0;

        failedMailByStudent.clear();
        const errorDetails = Array.isArray(result?.failed)
            ? result.failed.map((f) => {
                const studentId = String(f?.studentId || '');
                const reason = f?.reason || 'Unknown mail error';
                if (studentId) {
                    failedMailByStudent.set(studentId, reason);
                }
                const label = f?.email ? `${f.email}` : studentId || 'Unknown student';
                return `${label}: ${reason}`;
            })
            : [];

        renderMailRunStatus({
            sent: sentCount,
            skipped: skippedCount,
            failed: failedCount,
            timestamp: new Date().toISOString(),
            errors: errorDetails
        });

        const cumulative = upsertSavedProgress(cutoffDate, threshold, {
            addSent: sentCount,
            addSkipped: skippedCount,
            addFailed: failedCount,
            lastUpdated: new Date().toISOString()
        });

        renderMailProgressFromSaved(cutoffDate, threshold, {
            sent: cumulative.cumulativeSent,
            skipped: cumulative.cumulativeSkipped,
            failed: cumulative.cumulativeFailed,
            timestamp: cumulative.lastUpdated,
            errors: errorDetails
        });

        alert(`Email run completed. Sent: ${sentCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
        await generateReport();
    } catch (error) {
        if (error?.name === 'AbortError') {
            renderMailRunStatus({
                sent: 0,
                skipped: 0,
                failed: 0,
                timestamp: new Date().toISOString(),
                errors: ['Mail sending cancelled by admin from this page.']
            });
            alert('Mail sending cancelled.');
            return;
        }

        upsertSavedProgress(cutoffDate, threshold, {
            addFailed: 1,
            lastUpdated: new Date().toISOString()
        });

        renderMailRunStatus({
            sent: 0,
            skipped: 0,
            failed: 1,
            timestamp: new Date().toISOString(),
            errors: [error.message || 'Failed to send emails']
        });

        renderMailProgressFromSaved(cutoffDate, threshold, {
            errors: [error.message || 'Failed to send emails']
        });
        alert(error.message || 'Failed to send emails');
    } finally {
        currentSendAbortController = null;
        setSendingUiState(false);
    }
}

function cancelSendingEmails() {
    if (!isSendingEmails || !currentSendAbortController) {
        return;
    }

    currentSendAbortController.abort();
}

function setupSelectAllPending() {
    const selectAll = document.getElementById('selectAllPending');
    if (!selectAll) return;

    selectAll.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.row-selector:not(:disabled)').forEach((el) => {
            el.checked = checked;
        });
        refreshSummary();
    });
}

async function ensureAdminSession() {
    const currentUser = checkAuth();
    if (!currentUser || currentUser.role !== 'admin') {
        return false;
    }

    // Proactively refresh/validate session to avoid first-call 401s on page load.
    const refreshed = await api.tryRefreshToken();
    if (!refreshed) {
        const token = localStorage.getItem('token');
        const refreshToken = localStorage.getItem('refreshToken');
        if (!token || !refreshToken) {
            clearAuth();
            window.location.href = 'login.html';
            return false;
        }
    }

    try {
        const profile = await api.get('/auth/profile');
        if (!profile?.user || profile.user.role !== 'admin') {
            clearAuth();
            window.location.href = 'login.html';
            return false;
        }
        return true;
    } catch (error) {
        clearAuth();
        window.location.href = 'login.html';
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const isReady = await ensureAdminSession();
    if (!isReady) {
        return;
    }

    document.getElementById('cutoffDate').value = getTodayIso();
    updateCutoffDateDisplay();

    document.getElementById('generateBtn').addEventListener('click', generateReport);
    document.getElementById('sendEmailsBtn').addEventListener('click', sendSelectedEmails);
    document.getElementById('cancelSendBtn').addEventListener('click', cancelSendingEmails);
    document.getElementById('cutoffDate').addEventListener('change', updateCutoffDateDisplay);
    setupSelectAllPending();

    renderMailRunStatus();
    setSendingUiState(false);

    generateReport();
});
