document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username          = document.getElementById('username').value.trim();
    const email             = document.getElementById('email').value.trim();
    const password          = document.getElementById('password').value;
    const confirmPassword   = document.getElementById('confirmPassword').value;
    const consentEssential  = document.getElementById('consentEssential').checked;
    const consentAnalytics  = document.getElementById('consentAnalytics').checked;

    // ── Validate ──────────────────────────────────────────────
    if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'error');
        return;
    }

    if (!consentEssential) {
        showAlert('กรุณายินยอมการใช้ข้อมูลที่จำเป็น (Essential consent is required)', 'error');
        return;
    }

    // ── Submit ────────────────────────────────────────────────
    setLoading(true);

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                email,
                password,
                // ✅ ส่ง consent แยกตามวัตถุประสงค์
                consentEssential,
                consentAnalytics
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showAlert('Registration successful! Redirecting...', 'success');

            if (data.data?.token) {
                localStorage.setItem('accessToken', data.data.token);
            }

            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);

        } else {
            showAlert(data.error || data.message || 'Registration failed', 'error');
        }

    } catch (error) {
        showAlert('Network error. Please try again.', 'error');
        console.error('Register error:', error);

    } finally {
        setLoading(false);
    }
});

// ─── Google Register ──────────────────────────────────────────
function registerWithGoogle() {
    window.location.href = '/api/auth/google';
}

// ─── Loading State ────────────────────────────────────────────
function setLoading(isLoading) {
    const btn = document.querySelector('#registerForm button[type="submit"]');
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'Creating account...';
    } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || 'Create Account';
    }
}

// ─── Show Alert ───────────────────────────────────────────────
function showAlert(message, type) {
    const alertBox = document.getElementById('alert');
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = 'block';
    const duration = type === 'error' ? 6000 : 4000;
    setTimeout(() => { alertBox.style.display = 'none'; }, duration);
}