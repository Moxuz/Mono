// ==========================================
// LOGIN.JS - Login Form Handler
// ==========================================

// Toggle password visibility
function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility';
    }
}

// Show alert message
function showAlert(message, type = 'error') {
    const alert = document.getElementById('alert');
    
    if (!message || message.trim() === '') {
        alert.style.display = 'none';
        return;
    }
    
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.style.display = 'block';
    
    setTimeout(() => {
        alert.style.display = 'none';
    }, 5000);
}

// Validate email format
function isValidEmail(email) {
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,63}$/.test(email);
}

function safeReturnTo(value) {
    if (typeof value !== 'string' || value.length > 2048 ||
        !/^\/(?![\\/])/.test(value) || /[\r\n]/.test(value)) return null;
    try {
        const url = new URL(value, window.location.origin);
        if (url.origin !== window.location.origin) return null;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return null;
    }
}

// Handle form submission
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;
    const loginBtn = document.getElementById('loginBtn');
    
    // Validation
    if (!email || !isValidEmail(email)) {
        showAlert('INVALID_EMAIL_FORMAT', 'error');
        return;
    }
    
    if (!password) {
        showAlert('PASSWORD_REQUIRED', 'error');
        return;
    }

    if (password.length > 128) {
        showAlert('PASSWORD_TOO_LONG', 'error');
        return;
    }
    
    // Show loading state
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<div class="spinner"></div><span>AUTHENTICATING...</span>';
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                password: password,
                remember: remember
            }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (typeof window.syncStoredCookieConsent === 'function') {
                await window.syncStoredCookieConsent();
            }
            showAlert('AUTH_SUCCESS > REDIRECT_INIT', 'success');

            const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
            setTimeout(() => {
                window.location.href = returnTo || '/dashboard.html';
            }, 1000);
        } else {
            showAlert(data.message || 'AUTH_FAILED', 'error');
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>SIGN_IN_INIT</span>';
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('ERR_NETWORK_FAILURE', 'error');
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>SIGN_IN_INIT</span>';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    const form = document.getElementById('loginForm');
    const alert = document.getElementById('alert');

    // ── Auto-redirect for an existing HttpOnly browser session ──────────────
    try {
        const sessionResponse = await fetch('/api/auth/session', { credentials: 'same-origin' });
        const session = await sessionResponse.json();
        if (session.authenticated) {
            const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
            window.location.href = returnTo || '/dashboard.html';
            return;
        }
    } catch (_) {
        // Keep the login form usable when the API is temporarily unavailable.
    }

    // Hide alert on page load
    if (alert) {
        alert.style.display = 'none';
    }

    // Show success message after password reset
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === 'success') {
        showAlert('Password reset successfully. Please sign in with your new password.', 'success');
    }
    
    // Attach form submit handler
    if (form) {
        form.addEventListener('submit', handleLogin);
    }
    
    // Attach password toggle handlers
    const passwordToggleBtns = document.querySelectorAll('.password-toggle');
    passwordToggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const inputId = this.getAttribute('data-input');
            const iconId = this.getAttribute('data-icon');
            togglePassword(inputId, iconId);
        });
    });
});
