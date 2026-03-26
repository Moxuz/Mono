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
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
            // Store token — use localStorage if "Remember me", sessionStorage otherwise
            const token = data.data?.token || data.token;
            const storage = remember ? localStorage : sessionStorage;
            if (token) {
                storage.setItem('token', token);
                // Clear the other storage to avoid stale tokens
                if (remember) sessionStorage.removeItem('token');
                else localStorage.removeItem('token');
            }

            // Store user data
            if (data.data && data.data.user) {
                const user = {
                    id: data.data.user._id || data.data.user.id,
                    username: data.data.user.username,
                    email: data.data.user.email,
                    role: data.data.user.role || 'user'
                };
                storage.setItem('user', JSON.stringify(user));
                if (remember) sessionStorage.removeItem('user');
                else localStorage.removeItem('user');
            } else {
                // If API doesn't return user data, fetch profile
                try {
                    const profileResponse = await fetch('/api/auth/profile', {
                        headers: {
                            'Authorization': 'Bearer ' + token
                        }
                    });

                    const profileData = await profileResponse.json();

                    if (profileData.success && profileData.data) {
                        const user = {
                            id: profileData.data._id || profileData.data.id,
                            username: profileData.data.username,
                            email: profileData.data.email,
                            role: profileData.data.role || 'user'
                        };
                        storage.setItem('user', JSON.stringify(user));
                    }
                } catch (error) {
                    console.error('Failed to fetch profile:', error);
                }
            }
            
            showAlert('AUTH_SUCCESS > REDIRECT_INIT', 'success');

            const returnTo = new URLSearchParams(window.location.search).get('returnTo');
            setTimeout(() => {
                if (returnTo) {
                    // Bridge: set server-side session then continue OAuth flow
                    window.location.href = `/api/auth/oauth-session?token=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(returnTo)}`;
                } else {
                    window.location.href = '/dashboard.html';
                }
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
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginForm');
    const alert = document.getElementById('alert');
    
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