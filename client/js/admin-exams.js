function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

let allClasses = [];
const selectedClassIds = new Set();

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

function renderExams(exams) {
    const tbody = document.querySelector('#examsTable tbody');
    if (!tbody) return;

    if (!Array.isArray(exams) || !exams.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No exams found</td></tr>';
        return;
    }

    tbody.innerHTML = exams.map((exam) => `
        <tr>
            <td>${exam.examName}</td>
            <td>${String(exam.examType || 'regular').toUpperCase()}</td>
            <td>${String(exam.marksType || 'written').toUpperCase()}</td>
            <td>${exam.totalMarks}</td>
            <td>${exam.internalOutOf}</td>
            <td>${Array.isArray(exam.applicableClasses) ? exam.applicableClasses.map((c) => c.className).join(', ') : '-'}</td>
            <td>${exam.isActive ? 'Active' : 'Inactive'}</td>
            <td>${new Date(exam.createdAt).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

function classSearchText(cls) {
    return [cls.className, cls.department, String(cls.year || ''), cls.batch, cls.section]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

async function loadClassChecklist() {
    const data = await api.get('/classes');
    allClasses = Array.isArray(data?.classes) ? data.classes : [];
    renderClassPanels();
}

function renderClassPanels() {
    const availableWrap = document.getElementById('availableClassList');
    const selectedWrap = document.getElementById('selectedClassList');
    const availableMeta = document.getElementById('availableClassSearchMeta');
    const selectedMeta = document.getElementById('selectedClassSearchMeta');
    const availableTerm = (document.getElementById('availableClassSearch')?.value || '').trim().toLowerCase();
    const selectedTerm = (document.getElementById('selectedClassSearch')?.value || '').trim().toLowerCase();

    const available = allClasses
        .filter((cls) => !selectedClassIds.has(String(cls._id)))
        .filter((cls) => !availableTerm || classSearchText(cls).includes(availableTerm));

    const selected = allClasses
        .filter((cls) => selectedClassIds.has(String(cls._id)))
        .filter((cls) => !selectedTerm || classSearchText(cls).includes(selectedTerm));

    if (availableWrap) {
        availableWrap.innerHTML = available.length
            ? available.map((cls) => `
                <div class="class-row">
                    <div class="class-meta">
                        <span>${cls.className}</span>
                        <small>${cls.department || '-'} | Year ${cls.year || '-'}${cls.section ? ` | Sec ${cls.section}` : ''}</small>
                    </div>
                    <button type="button" class="btn btn-small btn-primary" data-add-class="${cls._id}">Add</button>
                </div>
            `).join('')
            : '<div class="class-row"><span class="text-center" style="width:100%;">No classes found</span></div>';
    }

    if (selectedWrap) {
        selectedWrap.innerHTML = selected.length
            ? selected.map((cls) => `
                <div class="class-row">
                    <div class="class-meta">
                        <span>${cls.className}</span>
                        <small>${cls.department || '-'} | Year ${cls.year || '-'}${cls.section ? ` | Sec ${cls.section}` : ''}</small>
                    </div>
                    <button type="button" class="btn btn-small btn-danger" data-remove-class="${cls._id}">Remove</button>
                </div>
            `).join('')
            : '<div class="class-row"><span class="text-center" style="width:100%;">No selected classes</span></div>';
    }

    if (availableMeta) {
        availableMeta.textContent = `${available.length} available`;
    }
    if (selectedMeta) {
        selectedMeta.textContent = `${selectedClassIds.size} selected`;
    }
}

function setupClassSearch() {
    const availableInput = document.getElementById('availableClassSearch');
    const selectedInput = document.getElementById('selectedClassSearch');

    if (availableInput) {
        availableInput.addEventListener('input', renderClassPanels);
    }
    if (selectedInput) {
        selectedInput.addEventListener('input', renderClassPanels);
    }

    document.addEventListener('click', (e) => {
        const addBtn = e.target.closest('[data-add-class]');
        if (addBtn) {
            selectedClassIds.add(String(addBtn.getAttribute('data-add-class')));
            renderClassPanels();
            return;
        }

        const removeBtn = e.target.closest('[data-remove-class]');
        if (removeBtn) {
            selectedClassIds.delete(String(removeBtn.getAttribute('data-remove-class')));
            renderClassPanels();
        }
    });
}

async function loadExams() {
    const data = await api.get('/marks/exams?includeInactive=true');
    renderExams(data.exams || []);
}

async function createExam(e) {
    e.preventDefault();

    const examName = document.getElementById('examName').value.trim();
    const examType = document.getElementById('examType').value;
    const marksType = document.getElementById('marksType').value;
    const totalMarks = Number(document.getElementById('totalMarks').value);
    const internalOutOf = Number(document.getElementById('internalOutOf').value || 0);
    const classIds = Array.from(selectedClassIds);

    if (!examName) {
        alert('Exam name is required');
        return;
    }

    if (!classIds.length) {
        alert('Select at least one class');
        return;
    }

    await api.post('/marks/exams', {
        examName,
        examType,
        marksType,
        totalMarks,
        internalOutOf,
        classIds
    });

    alert('Exam created successfully');
    document.getElementById('createExamForm').reset();
    document.getElementById('totalMarks').value = 100;
    document.getElementById('internalOutOf').value = 25;
    selectedClassIds.clear();
    renderClassPanels();
    await loadExams();
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user || user.role !== 'admin') return;

    setupLogout();
    setupClassSearch();
    document.getElementById('createExamForm').addEventListener('submit', async (e) => {
        try {
            await createExam(e);
        } catch (error) {
            alert(error.message || 'Failed to create exam');
        }
    });

    try {
        await loadClassChecklist();
        await loadExams();
    } catch (error) {
        alert(error.message || 'Failed to load exams');
    }
});
