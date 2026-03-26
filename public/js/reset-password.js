(() => {
  'use strict';

  const form            = document.getElementById('resetPasswordForm');
  const passwordInput   = document.getElementById('password');
  const confirmInput    = document.getElementById('confirmPassword');
  const submitBtn       = document.getElementById('submitBtn');
  const alertEl         = document.getElementById('alert');

  // Get token from URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  // ─── Alert ──────────────────────────────────────────────────────────────────
  const showAlert = (message, type = 'error') => {
    alertEl.className    = `alert alert-${type}`;
    alertEl.textContent  = message;
    alertEl.style.display = 'block';
  };

  const hideAlert = () => {
    alertEl.style.display = 'none';
    alertEl.textContent   = '';
  };

  // ─── Check Token ────────────────────────────────────────────────────────────
  if (!token) {
    showAlert('Invalid or missing reset token', 'error');
    submitBtn.disabled = true;
  }

  // ─── Field Error ────────────────────────────────────────────────────────────
  const showFieldError = (fieldId, message) => {
    const el = document.getElementById(`${fieldId}-error`);
    const input = document.getElementById(fieldId);
    
    if (!el || !input) return;
    
    el.textContent = message;
    el.classList.toggle('show', !!message);
    input.classList.toggle('input-error',   !!message);
    input.classList.toggle('input-success', !message && !!input.value);
  };

  // ─── Validate ───────────────────────────────────────────────────────────────
  const validatePassword = () => {
    const value = passwordInput.value;
    
    if (value.length < 8) {
      showFieldError('password', 'Password must be at least 8 characters');
      return false;
    }

    if (!/[0-9]/.test(value)) {
      showFieldError('password', 'Password must contain at least 1 number');
      return false;
    }

    showFieldError('password', '');
    return true;
  };

  const validateConfirmPassword = () => {
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    
    if (!confirm) {
      showFieldError('confirmPassword', 'Please confirm your password');
      return false;
    }
    
    if (confirm !== password) {
      showFieldError('confirmPassword', 'Passwords do not match');
      return false;
    }
    
    showFieldError('confirmPassword', '');
    return true;
  };

  // ─── Event Listeners ────────────────────────────────────────────────────────
  passwordInput.addEventListener('input', () => {
    if (passwordInput.classList.contains('input-error')) validatePassword();
    hideAlert();
  });

  confirmInput.addEventListener('input', () => {
    if (confirmInput.classList.contains('input-error')) validateConfirmPassword();
    hideAlert();
  });

  passwordInput.addEventListener('blur', validatePassword);
  confirmInput.addEventListener('blur', validateConfirmPassword);

  // ─── Loading ────────────────────────────────────────────────────────────────
  const setLoading = (loading) => {
    submitBtn.disabled    = loading;
    submitBtn.textContent = loading ? 'Resetting...' : 'Reset Password';
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    if (!validatePassword() || !validateConfirmPassword()) {
      return;
    }

    const password = passwordInput.value;
    setLoading(true);

    try {
      const res = await fetch(`/api/auth/reset-password/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to reset password');
      }

      showAlert('Password reset successful! Redirecting to login...', 'success');
      
      setTimeout(() => {
        window.location.href = '/login.html?reset=success';
      }, 2000);

    } catch (error) {
      showAlert(error.message, 'error');
    } finally {
      setLoading(false);
    }
  });

})();