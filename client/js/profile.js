document.addEventListener('DOMContentLoaded', () => {
    const currentUser = checkAuth();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    loadSidebar(currentUser.role);
    loadProfile();

    document.getElementById('profileForm').addEventListener('submit', updateProfile);
    document.getElementById('passwordForm').addEventListener('submit', changePassword);
});

function loadSidebar(role) {
    const sidebar = document.getElementById('sidebar');
    let menu = '';

    const baseMenu = `
        <li><a href="profile.html" class="nav-link active">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Profile
        </a></li>
    `;

    if (role === 'admin') {
        menu = `
            <div class="sidebar-header"><h3>AttendPro</h3><span class="sidebar-badge">Admin</span></div>
            <ul class="nav-menu">
                <li><a href="admin-dashboard.html" class="nav-link">Dashboard</a></li>
                <li><a href="add-students.html" class="nav-link">Add Students</a></li>
                ${baseMenu}
                <li><a href="login.html" class="nav-link logout" id="logoutBtn">Logout</a></li>
            </ul>
        `;
    } else if (role === 'faculty') {
        menu = `
            <div class="sidebar-header"><h3>AttendPro</h3><span class="sidebar-badge">Faculty</span></div>
            <ul class="nav-menu">
                <li><a href="faculty-dashboard.html" class="nav-link">Dashboard</a></li>
                ${baseMenu}
                <li><a href="login.html" class="nav-link logout" id="logoutBtn">Logout</a></li>
            </ul>
        `;
    } else {
        menu = `
            <div class="sidebar-header"><h3>AttendPro</h3><span class="sidebar-badge">Student</span></div>
            <ul class="nav-menu">
                <li><a href="student-dashboard.html" class="nav-link">Dashboard</a></li>
                ${baseMenu}
                <li><a href="login.html" class="nav-link logout" id="logoutBtn">Logout</a></li>
            </ul>
        `;
    }
    sidebar.innerHTML = menu;
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        clearAuth();
        window.location.href = 'login.html';
    });
}

async function loadProfile() {
    try {
        const user = await api.get('/user/profile');
        document.getElementById('name').value = user.name;
        document.getElementById('email').value = user.email;
        document.getElementById('userName').textContent = user.name;
        document.getElementById('userRole').textContent = user.role;
        document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Error loading profile');
    }
}

async function updateProfile(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;

    try {
        await api.put('/user/profile', { name, email });
        alert('Profile updated successfully');
        loadProfile();
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Error updating profile');
    }
}

async function changePassword(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        alert('New passwords do not match');
        return;
    }

    try {
        await api.put('/user/password', { oldPassword, newPassword });
        alert('Password changed successfully');
        document.getElementById('passwordForm').reset();
    } catch (error) {
        console.error('Error changing password:', error);
        alert('Error changing password: ' + error.message);
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}
