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
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate password (simplified - just 8 characters)
function validatePassword(password) {
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
        showAlert('You must agree to the Terms and Privacy Policy', 'error');
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
            showAlert('ACCOUNT_CREATED > REDIRECT_INIT', 'success');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1500);
        } else {
            showAlert(data.message || 'Registration failed', 'error');
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
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('registerForm');
    const passwordInput = document.getElementById('password');
    const alert = document.getElementById('alert');
    
    // ✅ ซ่อน alert เมื่อโหลดหน้าเสร็จ
    if (alert) {
        alert.style.display = 'none';
    }
    
    // Attach form submit handler
    if (form) {
        form.addEventListener('submit', handleRegister);
    }
    
    // Attach password strength handler
    if (passwordInput) {
        passwordInput.addEventListener('input', updatePasswordStrength);
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