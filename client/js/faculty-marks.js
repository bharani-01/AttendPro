let currentUser = null;
let facultyTimetables = [];
let loadedStudents = [];
let loadedExistingMarks = [];
let selectedExam = null;

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

function getUniqueById(items, key = '_id') {
    return [...new Map((items || []).filter(Boolean).map((i) => [i[key], i])).values()];
}

async function loadFilters() {
    const profile = await api.get('/auth/profile');
    currentUser = profile.user;

    const timetable = await api.get(`/timetable?facultyId=${currentUser._id}`);
    facultyTimetables = Array.isArray(timetable?.timetables) ? timetable.timetables : [];

    const classes = getUniqueById(facultyTimetables.map((t) => t.class).filter(Boolean));
    const classSelect = document.getElementById('marksClass');
    classSelect.innerHTML = '<option value="">Select Class</option>' +
        classes.map((c) => `<option value="${c._id}">${c.className}</option>`).join('');

    classSelect.addEventListener('change', async () => {
        renderSubjectsForSelectedClass();
        await loadExamsForSelectedClass();
    });
}

async function loadExamsForSelectedClass() {
    const classId = document.getElementById('marksClass').value;
    const endpoint = classId
        ? `/marks/exams?classId=${encodeURIComponent(classId)}`
        : '/marks/exams';

    const data = await api.get(endpoint);
    const exams = Array.isArray(data?.exams) ? data.exams : [];
    const examSelect = document.getElementById('marksExam');
    examSelect.innerHTML = '<option value="">Select Exam</option>' +
        exams.map((e) => `<option value="${e._id}" data-total="${e.totalMarks}" data-internal="${e.internalOutOf}" data-marks-type="${e.marksType || 'written'}" data-exam-type="${e.examType || 'regular'}">${e.examName} (${String(e.marksType || 'written').toUpperCase()} / ${e.totalMarks})</option>`).join('');
}

function renderSubjectsForSelectedClass() {
    const classId = document.getElementById('marksClass').value;
    const subjectSelect = document.getElementById('marksSubject');

    if (!classId) {
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        return;
    }

    const subjects = getUniqueById(
        facultyTimetables.filter((t) => t.class?._id === classId).map((t) => t.subject).filter(Boolean)
    );

    subjectSelect.innerHTML = '<option value="">Select Subject</option>' +
        subjects.map((s) => `<option value="${s._id}">${s.subjectName}</option>`).join('');
}

function findSelectedExam() {
    const examSelect = document.getElementById('marksExam');
    const selectedOption = examSelect.options[examSelect.selectedIndex];
    if (!selectedOption || !selectedOption.value) return null;

    return {
        _id: selectedOption.value,
        examType: selectedOption.getAttribute('data-exam-type') || 'regular',
        marksType: selectedOption.getAttribute('data-marks-type') || 'written',
        totalMarks: Number(selectedOption.getAttribute('data-total') || 0),
        internalOutOf: Number(selectedOption.getAttribute('data-internal') || 0)
    };
}

function renderMarksRows() {
    const tbody = document.querySelector('#marksTable tbody');
    if (!tbody) return;

    const marksMap = new Map(loadedExistingMarks.map((m) => [String(m.student?._id || m.student), m]));
    tbody.innerHTML = loadedStudents.map((student) => {
        const existing = marksMap.get(String(student._id));
        const max = selectedExam?.totalMarks || 0;
        const internalMax = selectedExam?.internalOutOf || 0;
        const marksType = selectedExam?.marksType || 'written';
        const writtenDisabled = marksType === 'internal' ? 'disabled' : '';
        const internalDisabled = marksType === 'written' || internalMax === 0 ? 'disabled' : '';

        return `
            <tr>
                <td>${student.name}</td>
                <td>${student.uniqueId || '-'}</td>
                <td><input type="number" min="0" max="${max}" step="0.01" class="mark-input" data-student-id="${student._id}" value="${existing?.marksObtained ?? ''}" ${writtenDisabled}></td>
                <td><input type="number" min="0" max="${internalMax}" step="0.01" class="internal-input" data-student-id="${student._id}" value="${existing?.internalMarksObtained ?? ''}" ${internalDisabled}></td>
                <td><input type="text" class="remark-input" data-student-id="${student._id}" value="${existing?.remarks || ''}"></td>
            </tr>
        `;
    }).join('');

    document.getElementById('marksTableWrap').style.display = '';
}

async function loadStudentsAndMarks() {
    const classId = document.getElementById('marksClass').value;
    const subjectId = document.getElementById('marksSubject').value;
    const examId = document.getElementById('marksExam').value;

    if (!classId || !subjectId || !examId) {
        alert('Select class, subject, and exam');
        return;
    }

    selectedExam = findSelectedExam();

    const [studentsData, marksData] = await Promise.all([
        api.get(`/marks/students?classId=${classId}`),
        api.get(`/marks/entries?classId=${classId}&subjectId=${subjectId}&examId=${examId}`)
    ]);

    loadedStudents = Array.isArray(studentsData?.students) ? studentsData.students : [];
    loadedExistingMarks = Array.isArray(marksData?.marks) ? marksData.marks : [];

    if (!loadedStudents.length) {
        alert('No students found for selected class');
    }

    renderMarksRows();
}

async function saveMarks() {
    const classId = document.getElementById('marksClass').value;
    const subjectId = document.getElementById('marksSubject').value;
    const examId = document.getElementById('marksExam').value;

    const markInputs = Array.from(document.querySelectorAll('.mark-input'));
    const marksType = selectedExam?.marksType || 'written';
    const entries = markInputs
        .map((input) => {
            const studentId = input.getAttribute('data-student-id');
            const marksValue = input.value;
            const internalInput = document.querySelector(`.internal-input[data-student-id="${studentId}"]`);
            const remarkInput = document.querySelector(`.remark-input[data-student-id="${studentId}"]`);

            const internalValue = internalInput?.value || '';
            if (marksType === 'written' && marksValue === '') return null;
            if (marksType === 'internal' && internalValue === '') return null;
            if (marksType === 'mixed' && marksValue === '' && internalValue === '') return null;

            return {
                studentId,
                marksObtained: Number(marksValue || 0),
                internalMarksObtained: Number(internalValue || 0),
                remarks: (remarkInput?.value || '').trim()
            };
        })
        .filter(Boolean);

    if (!entries.length) {
        alert('Enter at least one mark');
        return;
    }

    const result = await api.post('/marks/entries/upsert', {
        examId,
        classId,
        subjectId,
        entries
    });

    alert(`Marks saved. Success: ${result?.results?.saved?.length || 0}, Failed: ${result?.results?.failed?.length || 0}`);
    await loadStudentsAndMarks();
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user || user.role !== 'faculty') return;

    setupLogout();

    document.getElementById('loadStudentsBtn').addEventListener('click', async () => {
        try {
            await loadStudentsAndMarks();
        } catch (error) {
            alert(error.message || 'Failed to load student marks data');
        }
    });

    document.getElementById('saveMarksBtn').addEventListener('click', async () => {
        try {
            await saveMarks();
        } catch (error) {
            alert(error.message || 'Failed to save marks');
        }
    });

    try {
        await loadFilters();
        await loadExamsForSelectedClass();
    } catch (error) {
        alert(error.message || 'Failed to load marks filters');
    }
});
