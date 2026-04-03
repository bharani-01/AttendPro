document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    }

    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handleResetPassword);
    }
});

async function handleLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById('errorMessage');
    errorEl.style.display = 'none';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const data = await api.post('/auth/login', { email, password });
        setAuth(data.token, data.user, data.refreshToken);
        redirectBasedOnRole(data.user.role);
    } catch (error) {
        showError(error.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const errorEl = document.getElementById('errorMessage');
    errorEl.style.display = 'none';

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    if (!name || !email || !password || !role) {
        showError('All fields are required');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }

    try {
        const data = await api.post('/auth/register', { name, email, password, role });
        setAuth(data.token, data.user, data.refreshToken);
        redirectBasedOnRole(data.user.role);
    } catch (error) {
        showError(error.message);
    }
}

async function logout() {
    try {
        await api.post('/auth/logout', { refreshToken: localStorage.getItem('refreshToken') });
    } catch (error) {
        console.log('Logout API call failed, proceeding with local logout');
    } finally {
        clearAuth();
        window.location.href = 'login.html';
    }
}

document.addEventListener('click', (e) => {
    if (e.target.closest('#logoutBtn')) {
        e.preventDefault();
        logout();
    }
});

async function getCurrentUser(forceRefresh = false) {
    if (!forceRefresh) {
        const cachedUser = getAuth();
        if (cachedUser) return cachedUser;
    }
    
    try {
        const response = await api.get('/auth/profile');
        if (response.user) {
            setAuth(localStorage.getItem('token'), response.user, localStorage.getItem('refreshToken'));
            return response.user;
        }
        return null;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const errorEl = document.getElementById('errorMessage');
    const successEl = document.getElementById('successMessage');
    
    if(errorEl) errorEl.style.display = 'none';
    if(successEl) successEl.style.display = 'none';

    const email = document.getElementById('email').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    try {
        submitBtn.innerHTML = '<span>Sending...</span>';
        submitBtn.disabled = true;
        
        await api.post('/auth/forgot-password', { email });
        
        if (successEl) {
            successEl.textContent = 'Password reset link sent to your email.';
            successEl.style.display = 'block';
        }
    } catch (error) {
        if (errorEl) {
            errorEl.textContent = error.message || 'An error occurred';
            errorEl.style.display = 'block';
        }
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function handleResetPassword(e) {
    e.preventDefault();
    const errorEl = document.getElementById('errorMessage');
    const successEl = document.getElementById('successMessage');
    
    if(errorEl) errorEl.style.display = 'none';
    if(successEl) successEl.style.display = 'none';

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (!token) {
        if (errorEl) {
            errorEl.textContent = 'Invalid or missing reset token.';
            errorEl.style.display = 'block';
        }
        return;
    }

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        if (errorEl) {
            errorEl.textContent = 'Passwords do not match.';
            errorEl.style.display = 'block';
        }
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<span>Resetting...</span>';
        submitBtn.disabled = true;
        
        await api.post('/auth/reset-password', { token, newPassword });
        
        if (successEl) {
            successEl.textContent = 'Password reset successfully. Redirecting to login...';
            successEl.style.display = 'block';
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
    } catch (error) {
        if (errorEl) {
            errorEl.textContent = error.message || 'An error occurred';
            errorEl.style.display = 'block';
        }
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}
