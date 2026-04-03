const fs = require('fs');
const file = 'c:/Users/bhara/Downloads/attendance-app/client/js/faculty.js';

try {
    let content = fs.readFileSync(file, 'utf8');

    const regex = /async function loadInitialData\(\) \{[\s\S]*?(?=function renderWeeklyClassesChart)/g;

    const repl = `async function loadInitialData() {
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

`;

    content = content.replace(regex, repl);
    fs.writeFileSync(file, content, 'utf8');
    console.log('File updated successfully.');
} catch(err) {
    console.error(err);
}
