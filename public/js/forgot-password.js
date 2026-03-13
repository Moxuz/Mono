(() => {
  'use strict';

  const form            = document.getElementById('forgotForm');
  const emailInput      = document.getElementById('email');
  const submitBtn       = document.getElementById('submitBtn');
  const alertEl         = document.getElementById('alert');
  const formSection     = document.getElementById('form-section');
  const successSection  = document.getElementById('success-section');
  const sentEmailEl     = document.getElementById('sent-email');
  const resendBtn       = document.getElementById('resendBtn');
  const resendCountdown = document.getElementById('resend-countdown');

  let lastEmail      = '';
  let countdownTimer = null;

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
    el.textContent = message;
    el.classList.toggle('show', !!message);
    emailInput.classList.toggle('input-error',   !!message);
    emailInput.classList.toggle('input-success', !message && !!emailInput.value);
  };

  // ─── Validate ───────────────────────────────────────────────────────────────
  const validateEmail = () => {
    const value = emailInput.value.trim();
    const regex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!value) {
      showFieldError('Please enter your email address.');
      return false;
    }
    if (!regex.test(value)) {
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

  // ─── Countdown ──────────────────────────────────────────────────────────────
  const startCountdown = () => {
    let seconds        = 60;
    resendBtn.disabled = true;

    const tick = () => {
      resendCountdown.textContent = `(${seconds}s)`;
      if (seconds <= 0) {
        resendBtn.disabled          = false;
        resendCountdown.textContent = '';
        clearInterval(countdownTimer);
        return;
      }
      seconds--;
    };

    tick();
    countdownTimer = setInterval(tick, 1000);
  };

  // ─── Send Request ────────────────────────────────────────────────────────────
  const sendRequest = async (email) => {
    const res  = await fetch('/api/auth/forgot-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });

    const data = await res.json();

    if (res.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
    if (res.status >= 500) throw new Error('Server error. Please try again later.');

    return data;
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
      await sendRequest(email);
      formSection.style.display    = 'none';
      successSection.style.display = 'block';
      sentEmailEl.textContent      = email;
      startCountdown();
    } catch (error) {
      showAlert(error.message);
    } finally {
      setLoading(false);
    }
  });

  // ─── Resend ──────────────────────────────────────────────────────────────────
  resendBtn.addEventListener('click', async () => {
    resendBtn.disabled = true;
    try {
      await sendRequest(lastEmail);
      clearInterval(countdownTimer);
      startCountdown();
      showAlert('Email resent successfully. Please check your inbox.', 'success');
    } catch (error) {
      showAlert(error.message);
      resendBtn.disabled = false;
    }
  });

})();