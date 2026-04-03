const API_BASE = '/api';

class API {
    constructor() {
        this.token = localStorage.getItem('token');
        this.refreshToken = localStorage.getItem('refreshToken');
        this.refreshPromise = null;
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    async request(endpoint, options = {}, retryOnAuthFail = true) {
        const url = `${API_BASE}${endpoint}`;
        const config = {
            headers: this.getHeaders(),
            ...options
        };

        const nonRefreshableAuthEndpoints = new Set([
            '/auth/login',
            '/auth/register',
            '/auth/forgot-password',
            '/auth/reset-password',
            '/auth/refresh'
        ]);

        try {
            const response = await fetch(url, config);

            let data = {};
            try {
                data = await response.json();
            } catch (err) {
                data = {};
            }

            if (response.status === 401 && !nonRefreshableAuthEndpoints.has(endpoint)) {
                if (retryOnAuthFail) {
                    const refreshed = await this.tryRefreshToken();
                    if (refreshed) {
                        return this.request(endpoint, options, false);
                    }
                }

                clearAuth();
                if (this.shouldRedirectToLogin()) {
                    window.location.href = 'login.html';
                }
                throw new Error('Session expired. Please login again.');
            }

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    shouldRedirectToLogin() {
        const path = (window.location.pathname || '').toLowerCase();
        return !(
            path.endsWith('/login.html') ||
            path.endsWith('/register.html') ||
            path.endsWith('/forgot-password.html') ||
            path.endsWith('/reset-password.html')
        );
    }

    async tryRefreshToken() {
        if (!this.refreshToken) {
            return false;
        }

        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        this.refreshPromise = (async () => {
            try {
                const response = await this.request('/auth/refresh', {
                    method: 'POST',
                    body: JSON.stringify({ refreshToken: this.refreshToken })
                }, false);

                if (!response.token || !response.refreshToken) {
                    clearAuth();
                    return false;
                }

                setAuth(response.token, response.user || getAuth(), response.refreshToken);
                return true;
            } catch (err) {
                clearAuth();
                return false;
            } finally {
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined
        });
    }

    put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}

const api = new API();

function showError(message, elementId = 'errorMessage') {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
}

function setAuth(token, user, refreshToken = null) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
        api.refreshToken = refreshToken;
    }
    api.token = token;
}

function getAuth() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    api.token = null;
    api.refreshToken = null;
}

function redirectBasedOnRole(role) {
    switch (role) {
        case 'admin':
            window.location.href = 'admin-dashboard.html';
            break;
        case 'faculty':
            window.location.href = 'faculty-dashboard.html';
            break;
        case 'student':
            window.location.href = 'student-dashboard.html';
            break;
        default:
            window.location.href = 'login.html';
    }
}

function checkAuth() {
    const token = localStorage.getItem('token');
    const user = getAuth();
    
    if (!token || !user) {
        window.location.href = 'login.html';
        return null;
    }
    
    return user;
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(date) {
    return new Date(date).toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}
