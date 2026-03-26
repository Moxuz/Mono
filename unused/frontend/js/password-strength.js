/**
 * Password Strength Meter
 * Real-time password strength visualization
 */

// Password strength calculator (uses existing passwordValidator logic)
function calculatePasswordStrength(password) {
    if (!password || password.length === 0) {
        return {
            score: 0,
            strength: 'none',
            label: '',
            color: '#e2e8f0',
            percent: 0,
            requirements: []
        };
    }

    const requirements = [];
    let score = 0;

    // Length check
    if (password.length >= 8) {
        score += 20;
        requirements.push({ met: true, text: 'At least 8 characters' });
    } else {
        requirements.push({ met: false, text: 'At least 8 characters' });
    }

    if (password.length >= 12) {
        score += 10;
    }

    // Uppercase check
    if (/[A-Z]/.test(password)) {
        score += 20;
        requirements.push({ met: true, text: 'Uppercase letter' });
    } else {
        requirements.push({ met: false, text: 'Uppercase letter' });
    }

    // Lowercase check
    if (/[a-z]/.test(password)) {
        score += 20;
        requirements.push({ met: true, text: 'Lowercase letter' });
    } else {
        requirements.push({ met: false, text: 'Lowercase letter' });
    }

    // Number check
    if (/[0-9]/.test(password)) {
        score += 20;
        requirements.push({ met: true, text: 'Number' });
    } else {
        requirements.push({ met: false, text: 'Number' });
    }

    // Special character check
    if (/[^A-Za-z0-9]/.test(password)) {
        score += 20;
        requirements.push({ met: true, text: 'Special character' });
    } else {
        requirements.push({ met: false, text: 'Special character' });
    }

    // Penalize common patterns
    const commonPatterns = [
        /123/i,
        /abc/i,
        /password/i,
        /qwerty/i,
        /(.)\1{2,}/ // Repeated characters
    ];

    commonPatterns.forEach(pattern => {
        if (pattern.test(password)) {
            score -= 10;
        }
    });

    // Ensure score is between 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine strength level
    let strength, label, color;
    if (score < 30) {
        strength = 'weak';
        label = 'Weak';
        color = '#ef4444'; // Red
    } else if (score < 60) {
        strength = 'fair';
        label = 'Fair';
        color = '#f59e0b'; // Orange
    } else if (score < 80) {
        strength = 'good';
        label = 'Good';
        color = '#3b82f6'; // Blue
    } else {
        strength = 'strong';
        label = 'Strong';
        color = '#10b981'; // Green
    }

    return {
        score,
        strength,
        label,
        color,
        percent: score,
        requirements
    };
}

// Update strength meter UI
function updateStrengthMeter(password, meterSelector) {
    const result = calculatePasswordStrength(password);
    
    const meter = document.querySelector(meterSelector);
    if (!meter) return;

    // Update progress bar
    const progressBar = meter.querySelector('.strength-progress-bar');
    if (progressBar) {
        progressBar.style.width = `${result.percent}%`;
        progressBar.style.backgroundColor = result.color;
    }

    // Update strength label
    const label = meter.querySelector('.strength-label');
    if (label) {
        label.textContent = result.label;
        label.style.color = result.color;
    }

    // Update requirements list
    const requirementsList = meter.querySelector('.strength-requirements');
    if (requirementsList && result.requirements) {
        requirementsList.innerHTML = result.requirements
            .map(req => `
                <div class="strength-requirement ${req.met ? 'met' : 'not-met'}">
                    <i class="bi bi-${req.met ? 'check-circle-fill' : 'circle'}"></i>
                    <span>${req.text}</span>
                </div>
            `).join('');
    }

    return result;
}

// Toggle password visibility
function togglePasswordVisibility(inputId, toggleButtonId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleButtonId);
    
    if (!input || !toggle) return;

    toggle.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggle.innerHTML = isPassword ? 
            '<i class="bi bi-eye-slash"></i>' : 
            '<i class="bi bi-eye"></i>';
        toggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
}

// Initialize password strength meter
function initPasswordStrengthMeter(inputSelector, meterSelector) {
    const input = document.querySelector(inputSelector);
    if (!input) return;

    input.addEventListener('input', () => {
        updateStrengthMeter(input.value, meterSelector);
    });

    // Initial update
    updateStrengthMeter('', meterSelector);
}

// Export functions
window.passwordStrength = {
    calculate: calculatePasswordStrength,
    update: updateStrengthMeter,
    toggleVisibility: togglePasswordVisibility,
    init: initPasswordStrengthMeter
};
