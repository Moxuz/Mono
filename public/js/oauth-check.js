// public/scripts/oauth-check.js

(() => {
  'use strict';

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
        const { google, github, facebook } = data.data;

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

        // ✅ ซ่อนปุ่ม Facebook ถ้าไม่ได้เปิด (ถ้ามี)
        if (!facebook) {
          const facebookBtn = document.getElementById('facebookLoginBtn');
          if (facebookBtn) {
            facebookBtn.style.display = 'none';
            console.info('Facebook OAuth is disabled');
          }
        }

        // ✅ ถ้าไม่มี OAuth ใดๆ เปิดเลย ให้ซ่อนส่วน Social Login ทั้งหมด
        if (!google && !github && !facebook) {
          const socialLogin = document.querySelector('.social-login');
          const divider = document.querySelector('.divider');
          
          if (socialLogin) socialLogin.style.display = 'none';
          if (divider) divider.style.display = 'none';
          
          console.info('All OAuth providers are disabled');
        }
      }
    } catch (error) {
      console.error('Failed to check OAuth status:', error);
      // ถ้า API ไม่ทำงาน ให้แสดงปุ่มทั้งหมดไว้
    }
  }

  // ✅ เรียกใช้เมื่อ DOM โหลดเสร็จ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkOAuthStatus);
  } else {
    checkOAuthStatus();
  }
})();