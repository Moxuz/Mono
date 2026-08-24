// ==========================================
// REGISTER.JS - Registration Form Handler
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
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.style.display = 'block';
    
    alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    setTimeout(() => {
        alert.style.display = 'none';
    }, 5000);
}

// Validate email format
function isValidEmail(email) {
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,63}$/.test(email);
}

function hasSequentialCharacters(password) {
    const lower = password.toLowerCase();
    return ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']
        .some(sequence => Array.from({ length: sequence.length - 2 }, (_, i) => sequence.slice(i, i + 3))
            .some(part => lower.includes(part)));
}

// Match the server's hard constraints that can be checked locally.
function validatePassword(password) {
    if (password.length > 128) {
        return { isValid: false, missing: ['at most 128 characters'] };
    }
    if (password.length < 8) {
        return {
            isValid: false,
            missing: ['at least 8 characters']
        };
    }

    if (!/[0-9]/.test(password)) {
        return {
            isValid: false,
            missing: ['at least 1 number']
        };
    }

    if (hasSequentialCharacters(password)) {
        return { isValid: false, missing: ['no sequential characters'] };
    }

    if (/(.)\1{3,}/.test(password)) {
        return { isValid: false, missing: ['no repeated characters'] };
    }

    return {
        isValid: true,
        missing: []
    };
}

// Calculate password strength — 4 levels based on character variety
function calculatePasswordStrength(password) {
    if (!password) return {
        strength: '',
        text: 'Enter password...',
        width: '0%',
        color: 'var(--outline-variant)'
    };

    if (password.length < 8) {
        return {
            strength: 'weak',
            text: 'TOO_SHORT — min 8 characters',
            width: '25%',
            color: 'var(--error)'
        };
    }

    // Score by character variety (each type present = +1)
    const hasLower   = /[a-z]/.test(password);
    const hasUpper   = /[A-Z]/.test(password);
    const hasDigit   = /[0-9]/.test(password);
    const hasSymbol  = /[^a-zA-Z0-9]/.test(password);
    const score = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

    if (score === 1) {
        return {
            strength: 'fair',
            text: 'FAIR — add numbers or symbols',
            width: '50%',
            color: '#ff9800'
        };
    }
    if (score === 2 || score === 3) {
        return {
            strength: 'good',
            text: 'GOOD — add more variety to strengthen',
            width: '75%',
            color: 'var(--secondary)'
        };
    }
    return {
        strength: 'strong',
        text: 'STRONG — excellent password',
        width: '100%',
        color: 'var(--primary)'
    };
}

// Update password strength indicator
function updatePasswordStrength() {
    const password = document.getElementById('password').value;
    const strengthBarFill = document.getElementById('strengthBarFill');
    const strengthText = document.getElementById('strengthText');
    
    const { strength, text, width, color } = calculatePasswordStrength(password);
    
    strengthBarFill.style.width = width;
    strengthBarFill.style.backgroundColor = color;
    strengthText.textContent = text;
    strengthText.style.color = color;
}

// Handle form submission
async function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const consentEssential = document.getElementById('consentEssential').checked;
    const registerBtn = document.getElementById('registerBtn');
    
    // Validation
    if (!username) {
        showAlert('Please enter a username', 'error');
        return;
    }
    
    if (username.length < 3) {
        showAlert('Username must be at least 3 characters long', 'error');
        return;
    }

    if (username.length > 64) {
        showAlert('Username must be at most 64 characters long', 'error');
        return;
    }
    
    if (!email || !isValidEmail(email)) {
        showAlert('Please enter a valid email address', 'error');
        return;
    }
    
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.isValid) {
        showAlert(`Password must include: ${passwordCheck.missing.join(', ')}`, 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'error');
        return;
    }
    
    if (!consentEssential) {
        showAlert('You must agree to the Terms of Service and acknowledge the Privacy Notice', 'error');
        return;
    }
    
    // Show loading state
    registerBtn.disabled = true;
    registerBtn.innerHTML = '<div class="spinner"></div><span>INITIALIZING...</span>';
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username,
                email,
                password,
                consentEssential
            }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (typeof window.syncStoredCookieConsent === 'function') {
                await window.syncStoredCookieConsent();
            }
            showAlert('ACCOUNT_CREATED > REDIRECT_INIT', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1500);
        } else {
            const details = Array.isArray(data.details) ? `: ${data.details.join(', ')}` : '';
            showAlert((data.message || data.error || 'Registration failed') + details, 'error');
            registerBtn.disabled = false;
            registerBtn.innerHTML = '<span>CREATE_ACCOUNT</span><span class="material-symbols-outlined">person_add</span>';
        }
    } catch (error) {
        console.error('Registration error:', error);
        showAlert('ERR_NETWORK_FAILURE', 'error');
        registerBtn.disabled = false;
        registerBtn.innerHTML = '<span>CREATE_ACCOUNT</span><span class="material-symbols-outlined">person_add</span>';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    const form = document.getElementById('registerForm');
    const passwordInput = document.getElementById('password');
    const alert = document.getElementById('alert');

    // Bind before the session probe. A fast click must not fall back to a
    // native GET submission that could put registration data in the URL.
    if (form) {
        form.addEventListener('submit', handleRegister);
    }
    if (passwordInput) {
        passwordInput.addEventListener('input', updatePasswordStrength);
    }
    const passwordToggleBtns = document.querySelectorAll('.password-toggle');
    passwordToggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const inputId = this.getAttribute('data-input');
            const iconId = this.getAttribute('data-icon');
            togglePassword(inputId, iconId);
        });
    });

    // ── Auto-redirect for an existing HttpOnly browser session ──────────────
    try {
        const sessionResponse = await fetch('/api/auth/session', { credentials: 'same-origin' });
        const session = await sessionResponse.json();
        if (session.authenticated) {
            window.location.href = '/dashboard.html';
            return;
        }
    } catch (_) {
        // Keep the registration form usable when the API is unavailable.
    }

    // ✅ ซ่อน alert เมื่อโหลดหน้าเสร็จ
    if (alert) {
        alert.style.display = 'none';
    }
    
});
