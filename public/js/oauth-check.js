// public/scripts/oauth-check.js

(() => {
  'use strict';

  function bindRememberToSocialLogin() {
    const remember = document.getElementById('remember');
    if (!remember) return;

    ['googleLoginBtn', 'githubLoginBtn'].forEach((id) => {
      const button = document.getElementById(id);
      if (!button) return;

      const update = () => {
        const target = new URL(button.href, window.location.origin);
        if (target.origin !== window.location.origin) return;
        if (remember.checked) target.searchParams.set('remember', '1');
        else target.searchParams.delete('remember');
        button.href = `${target.pathname}${target.search}${target.hash}`;
      };

      remember.addEventListener('change', update);
      update();
    });
  }

  /**
   * เช็คว่า OAuth providers ไหนเปิดใช้งานอยู่
   * และซ่อนปุ่มที่ไม่ได้เปิด
   */
  async function checkOAuthStatus() {
    try {
      const res = await fetch('/api/auth/oauth/status');
      
      if (!res.ok) {
        console.warn('Failed to fetch OAuth status:', res.status);
        return;
      }

      const data = await res.json();

      if (data.success) {
        const { google, github } = data.data;

        // ✅ ซ่อนปุ่ม Google ถ้าไม่ได้เปิด
        if (!google) {
          const googleBtn = document.getElementById('googleLoginBtn');
          if (googleBtn) {
            googleBtn.style.display = 'none';
            console.info('Google OAuth is disabled');
          }
        }

        // ✅ ซ่อนปุ่ม GitHub ถ้าไม่ได้เปิด
        if (!github) {
          const githubBtn = document.getElementById('githubLoginBtn');
          if (githubBtn) {
            githubBtn.style.display = 'none';
            console.info('GitHub OAuth is disabled');
          }
        }

        // ✅ ถ้าไม่มี OAuth ใดๆ เปิดเลย ให้ซ่อนส่วน Social Login ทั้งหมด
        if (!google && !github) {
          const socialLogin = document.querySelector('.social-login');
          const divider = document.querySelector('.divider');

          if (socialLogin) socialLogin.style.display = 'none';
          if (divider) divider.style.display = 'none';

          console.info('All OAuth providers are disabled');
        }

        // ✅ ถ้ามี returnTo ใน URL (เช่น มาจาก OAuth client flow) ให้ส่งต่อไปด้วย
        const urlParams = new URLSearchParams(window.location.search);
        const returnTo = urlParams.get('returnTo');
        if (returnTo) {
          const googleBtn = document.getElementById('googleLoginBtn');
          const githubBtn = document.getElementById('githubLoginBtn');
          if (googleBtn && googleBtn.style.display !== 'none') {
            googleBtn.href = '/api/auth/google?returnTo=' + encodeURIComponent(returnTo);
          }
          if (githubBtn && githubBtn.style.display !== 'none') {
            githubBtn.href = '/api/auth/github?returnTo=' + encodeURIComponent(returnTo);
          }
        }
      }

      bindRememberToSocialLogin();
    } catch (error) {
      console.error('Failed to check OAuth status:', error);
      // ถ้า API ไม่ทำงาน ให้แสดงปุ่มทั้งหมดไว้
      bindRememberToSocialLogin();
    }
  }

  // ✅ เรียกใช้เมื่อ DOM โหลดเสร็จ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkOAuthStatus);
  } else {
    checkOAuthStatus();
  }
})();
