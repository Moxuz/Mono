(() => {
  'use strict';

  const form           = document.getElementById('resetForm');
  const passwordInput  = document.getElementById('password');
  const confirmInput   = document.getElementById('confirmPassword');
  const submitBtn      = document.getElementById('submitBtn');
  const alertEl        = document.getElementById('alert');
  const strengthWrap   = document.getElementById('strengthWrap');
  const strengthLabel  = document.getElementById('strengthLabel');
  const requirements   = document.getElementById('requirements');
  const formSection    = document.getElementById('form-section');
  const successSection = document.getElementById('success-section');
  const invalidSection = document.getElementById('invalid-section');

  // ─── Token ─────────────────────────────────────────────────────────────────
  const token = new URLSearchParams(window.location.search).get('token');

  if (!token) {
    formSection.style.display    = 'none';
    invalidSection.style.display = 'block';
  }

  // ─── Requirements ──────────────────────────────────────────────────────────
  const rules = {
    length:  { el: document.getElementById('req-length'),  test: (v) => v.length >= 8 },
    upper:   { el: document.getElementById('req-upper'),   test: (v) => /[A-Z]/.test(v) },
    lower:   { el: document.getElementById('req-lower'),   test: (v) => /[a-z]/.test(v) },
    number:  { el: document.getElementById('req-number'),  test: (v) => /[0-9]/.test(v) },
    special: { el: document.getElementById('req-special'), test: (v) => /[^A-Za-z0-9]/.test(v) },
  };

  const checkRequirements = (value) => {
    let passed = 0;
    Object.values(rules).forEach(({ el, test }) => {
      const ok = test(value);
      el.classList.toggle('met', ok);
      el.querySelector('.req-icon').textContent = ok ? '●' : '○';
      if (ok) passed++;
    });
    return passed;
  };

  // ─── Strength ───────────────────────────────────────────────────────────────
  const strengthConfig = [
    { label: 'Very Weak', cls: 'strength-weak'   },
    { label: 'Fair',      cls: 'strength-fair'   },
    { label: 'Good',      cls: 'strength-good'   },
    { label: 'Strong',    cls: 'strength-strong' },
  ];

  const updateStrength = (passed) => {
    const index           = passed <= 1 ? 0 : passed <= 2 ? 1 : passed <= 3 ? 2 : 3;
    const { label, cls }  = strengthConfig[index];
    strengthWrap.className = `strength-wrap ${cls}`;
    strengthLabel.textContent = `Strength: ${label}`;
  };

  // ─── Field Error ────────────────────────────────────────────────────────────
  const showFieldError = (field, message) => {
    const el = document.getElementById(`${field}-error`);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', !!message);
  };

  // ─── Validate ───────────────────────────────────────────────────────────────
  const validateConfirm = () => {
    const val = confirmInput.value;
    if (!val) {
      showFieldError('confirm', 'Please confirm your password.');
      confirmInput.classList.add('input-error');
      return false;
    }
    if (passwordInput.value !== val) {
      showFieldError('confirm', 'Passwords do not match.');
      confirmInput.classList.add('input-error');
      return false;
    }
    showFieldError('confirm', '');
    confirmInput.classList.remove('input-error');
    return true;
  };

  const validatePassword = () => {
    const value  = passwordInput.value;
    const passed = checkRequirements(value);
    if (!value) {
      showFieldError('password', 'Please enter a new password.');
      passwordInput.classList.add('input-error');
      return false;
    }
    if (passed < 3) {
      showFieldError('password', 'Password must meet at least 3 requirements.');
      passwordInput.classList.add('input-error');
      return false;
    }
    showFieldError('password', '');
    passwordInput.classList.remove('input-error');
    return true;
  };

  // ─── Alert ──────────────────────────────────────────────────────────────────
  const showAlert = (message, type = 'error') => {
    alertEl.className     = `alert alert-${type}`;
    alertEl.textContent   = message;
    alertEl.style.display = 'block';
  };

  const hideAlert = () => {
    alertEl.style.display = 'none';
  };

  // ─── Loading ────────────────────────────────────────────────────────────────
  const setLoading = (loading) => {
    submitBtn.disabled    = loading;
    submitBtn.textContent = loading ? 'Saving...' : 'Reset Password';
  };

  // ─── Events ─────────────────────────────────────────────────────────────────
  passwordInput.addEventListener('focus', () => {
    strengthWrap.style.display  = 'block';
    requirements.style.display  = 'block';
  });

  passwordInput.addEventListener('input', () => {
    const passed = checkRequirements(passwordInput.value);
    updateStrength(passed);
    showFieldError('password', '');
    passwordInput.classList.remove('input-error');
    if (confirmInput.value) validateConfirm();
  });

  confirmInput.addEventListener('input', validateConfirm);

  document.querySelectorAll('.toggle-pw').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input     = document.getElementById(btn.dataset.target);
      const isHidden  = input.type === 'password';
      input.type      = isHidden ? 'text' : 'password';
      btn.textContent = isHidden ? '🙈' : '👁';
    });
  });

  // ─── Submit ──────────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideAlert();

    const pwOk      = validatePassword();
    const confirmOk = validateConfirm();
    if (!pwOk || !confirmOk) return;

    setLoading(true);

    try {
      const res  = await fetch(`/api/auth/reset-password/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: passwordInput.value }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400 || res.status === 404) {
          formSection.style.display    = 'none';
          invalidSection.style.display = 'block';
          return;
        }
        throw new Error(data.message || 'Something went wrong. Please try again.');
      }

      formSection.style.display    = 'none';
      successSection.style.display = 'block';

    } catch (error) {
      showAlert(error.message);
    } finally {
      setLoading(false);
    }
  });

})();