(() => {
  'use strict';

  const form            = document.getElementById('forgotForm');
  const emailInput      = document.getElementById('email');
  const submitBtn       = document.getElementById('submitBtn');
  const alertEl         = document.getElementById('alert');
  const formSection     = document.getElementById('form-section');
  const successSection  = document.getElementById('success-section');
  const sentEmailEl     = document.getElementById('sent-email');

  // ตรวจสอบว่า element มีหรือไม่ก่อน
  if (!form || !emailInput || !submitBtn || !alertEl) {
    console.error('❌ Required elements not found');
    return;
  }

  let lastEmail = '';

  // ─── Alert ─────────────────────────────────────────────────────────────────
  const showAlert = (message, type = 'error') => {
    alertEl.className    = `alert alert-${type}`;
    alertEl.textContent  = message;
    alertEl.style.display = 'block';
  };

  const hideAlert = () => {
    alertEl.style.display = 'none';
    alertEl.textContent   = '';
  };

  // ─── Field Error ────────────────────────────────────────────────────────────
  const showFieldError = (message) => {
    const el = document.getElementById('email-error');
    if (!el) return;
    
    el.textContent = message;
    el.classList.toggle('show', !!message);
    emailInput.classList.toggle('input-error',   !!message);
    emailInput.classList.toggle('input-success', !message && !!emailInput.value);
  };

  // ─── Validate ───────────────────────────────────────────────────────────────
  const validateEmail = () => {
    const value = emailInput.value.trim();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,63}$/;
    
    if (!value) {
      showFieldError('Please enter your email address.');
      return false;
    }
    if (value.length > 254 || !regex.test(value)) {
      showFieldError('Please enter a valid email address.');
      return false;
    }
    showFieldError('');
    return true;
  };

  emailInput.addEventListener('input', () => {
    if (emailInput.classList.contains('input-error')) validateEmail();
    hideAlert();
  });
  
  emailInput.addEventListener('blur', validateEmail);

  // ─── Loading ────────────────────────────────────────────────────────────────
  const setLoading = (loading) => {
    submitBtn.disabled    = loading;
    submitBtn.textContent = loading ? 'Sending...' : 'Send Reset Link';
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    
    if (!validateEmail()) return;

    const email = emailInput.value.trim();
    lastEmail   = email;
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.status === 429) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      }
      
      if (res.status >= 500) {
        throw new Error('Server error. Please try again later.');
      }

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Unable to process the request.');
      }

      // แสดง success message
      if (formSection && successSection && sentEmailEl) {
        formSection.style.display    = 'none';
        successSection.style.display = 'block';
        sentEmailEl.textContent      = email;
      } else {
        // ถ้าไม่มี success section ให้แสดง alert แทน
        showAlert(
          'If this email exists, a reset link has been sent. Please check your inbox.',
          'success'
        );
      }

    } catch (error) {
      showAlert(error.message);
    } finally {
      setLoading(false);
    }
  });

})();
