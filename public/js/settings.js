(() => {
  'use strict';

  // ─── Elements ────────────────────────────────────────────────────────────────
  const logoutBtnTop = document.getElementById('logoutBtnTop');
  const userEmailTop = document.getElementById('userEmailTop');
  const userNameSide = document.getElementById('userNameSide');
  const userRoleSide = document.getElementById('userRoleSide');

  // Settings
  const themeSelect = document.getElementById('themeSelect');
  const languageSelect = document.getElementById('languageSelect');
  const emailNotif = document.getElementById('emailNotif');
  const loginAlerts = document.getElementById('loginAlerts');

  // Buttons
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');

  // ─── Auth Check ──────────────────────────────────────────────────────────────
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  // ─── Load User Profile ───────────────────────────────────────────────────────
  async function loadUserProfile() {
    try {
      const res = await fetch('/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to load profile');

      const data = await res.json();
      const user = data.data;

      userEmailTop.textContent = user.email;
      userNameSide.textContent = user.username;
      userRoleSide.textContent = user.role.toUpperCase();

    } catch (error) {
      console.error('Load profile error:', error);
      showAlert('Failed to load profile', 'error');
    }
  }

  // ─── Load Settings ───────────────────────────────────────────────────────────
  async function loadSettings() {
    try {
      // Load from backend
      const res = await fetch('/api/auth/preferences', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const prefs = data.data.preferences;

        themeSelect.value = prefs.theme || 'dark';
        languageSelect.value = prefs.language || 'en';
        emailNotif.checked = prefs.notifications?.email !== false;
        loginAlerts.checked = prefs.notifications?.loginAlerts !== false;

        // Apply theme
        applyTheme(prefs.theme);
      } else {
        // Fallback to localStorage
        loadSettingsFromLocalStorage();
      }
    } catch (error) {
      console.error('Load settings error:', error);
      loadSettingsFromLocalStorage();
    }
  }

  function loadSettingsFromLocalStorage() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedLanguage = localStorage.getItem('language') || 'en';
    const savedEmailNotif = localStorage.getItem('emailNotif') !== 'false';
    const savedLoginAlerts = localStorage.getItem('loginAlerts') !== 'false';

    themeSelect.value = savedTheme;
    languageSelect.value = savedLanguage;
    emailNotif.checked = savedEmailNotif;
    loginAlerts.checked = savedLoginAlerts;

    applyTheme(savedTheme);

    if (!localStorage.getItem('theme')) {
    localStorage.setItem('theme', 'dark');
  }

  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else if (theme === 'auto') {
      // Use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }

  // ─── Save Settings ───────────────────────────────────────────────────────────
  async function saveSettings() {
    try {
      saveSettingsBtn.disabled = true;
      saveSettingsBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Saving...';

      const preferences = {
        theme: themeSelect.value,
        language: languageSelect.value,
        notifications: {
          email: emailNotif.checked,
          loginAlerts: loginAlerts.checked
        }
      };

      // Save to backend
      const res = await fetch('/api/auth/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(preferences)
      });

      if (!res.ok) {
        throw new Error('Failed to save preferences');
      }

      // Also save to localStorage as backup
      localStorage.setItem('theme', preferences.theme);
      localStorage.setItem('language', preferences.language);
      localStorage.setItem('emailNotif', preferences.notifications.email);
      localStorage.setItem('loginAlerts', preferences.notifications.loginAlerts);

      // Apply theme
      applyTheme(preferences.theme);

      showAlert('Settings saved successfully', 'success');

    } catch (error) {
      console.error('Save settings error:', error);
      showAlert('Failed to save settings', 'error');
    } finally {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.innerHTML = '<span class="material-symbols-outlined">save</span> Save Changes';
    }
  }

  // ─── Delete Account ──────────────────────────────────────────────────────────
  function deleteAccount() {
    const modalHTML = `
      <div class="modal open" id="deleteAccountModal">
        <div class="modal-overlay" data-close-modal></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">
              <span class="material-symbols-outlined" style="color: var(--error); vertical-align: middle; margin-right: 0.5rem;">warning</span>
              Delete Account
            </h3>
            <button class="modal-close" data-close-modal>
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          
          <div class="modal-body">
            <div class="secret-warning">
              <span class="material-symbols-outlined">warning</span>
              <p>
                <strong>This action cannot be undone.</strong><br>
                All your data will be permanently deleted including profile, sessions, and activity logs.
              </p>
            </div>

            <div id="deleteAlert" class="alert" style="display: none; margin-bottom: 1rem;"></div>

            <form id="deleteAccountForm">
              <div class="form-group">
                <label for="deletePassword" class="input-label">
                  Confirm with Password
                </label>
                <input 
                  type="password" 
                  id="deletePassword" 
                  class="input" 
                  placeholder="Enter your password"
                  required
                  autofocus
                />
                <p class="text-xs text-on-surface-variant" style="margin-top: 0.5rem;">
                  Enter your password to confirm account deletion
                </p>
              </div>

              <div class="modal-footer" style="margin-top: 1.5rem; padding: 0; border: none; background: none;">
                <button type="button" class="btn btn-ghost" data-close-modal>
                  Cancel
                </button>
                <button type="submit" class="btn btn-danger" id="confirmDeleteBtn">
                  <span class="material-symbols-outlined">delete_forever</span>
                  Delete Account
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.classList.add('modal-open');

    const modal = document.getElementById('deleteAccountModal');
    const form = document.getElementById('deleteAccountForm');
    const closeButtons = modal.querySelectorAll('[data-close-modal]');

    closeButtons.forEach(btn => {
      btn.addEventListener('click', closeDeleteModal);
    });

    form.addEventListener('submit', handleDeleteAccount);
  }

  function closeDeleteModal() {
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
      modal.classList.remove('open');
      setTimeout(() => {
        modal.remove();
        document.body.classList.remove('modal-open');
      }, 300);
    }
  }

  async function handleDeleteAccount(e) {
    e.preventDefault();

    const password = document.getElementById('deletePassword').value;
    const submitBtn = document.getElementById('confirmDeleteBtn');

    if (!password) {
      showModalAlert('Please enter your password', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Deleting...';

    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }

      showModalAlert('Account deleted successfully. Redirecting...', 'success');
      
      setTimeout(() => {
        localStorage.clear();
        window.location.href = '/login.html?deleted=true';
      }, 2000);

    } catch (error) {
      console.error('Delete account error:', error);
      showModalAlert(error.message, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span class="material-symbols-outlined">delete_forever</span> Delete Account';
    }
  }


  
function applyTheme(theme) {
  const html = document.documentElement;
  
  if (theme === 'dark') {
    html.classList.add('dark');
  } else if (theme === 'light') {
    html.classList.remove('dark');
  } else if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }
}

    // ✅ เพิ่ม Event Listener สำหรับ Dropdown
    themeSelect.addEventListener('change', (e) => {
    applyTheme(e.target.value);
    });

    // ✅ เพิ่ม Auto Theme Listener
    if (themeSelect.value === 'auto') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (themeSelect.value === 'auto') {
        if (e.matches) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        }
    });
    }

  function showModalAlert(message, type) {
    const alertEl = document.getElementById('deleteAlert');
    if (!alertEl) return;

    alertEl.className = `alert alert-${type}`;
    alertEl.textContent = message;
    alertEl.style.display = 'block';
  }

  // ─── Show Alert ──────────────────────────────────────────────────────────────
  function showAlert(message, type = 'success') {
    const alertEl = document.getElementById('alert');
    if (alertEl) {
      alertEl.className = `alert alert-${type}`;
      alertEl.textContent = message;
      alertEl.style.display = 'block';

      setTimeout(() => {
        alertEl.style.display = 'none';
      }, 5000);
    }
  }

  // ─── Event Listeners ─────────────────────────────────────────────────────────
  saveSettingsBtn.addEventListener('click', saveSettings);
  deleteAccountBtn.addEventListener('click', deleteAccount);

  logoutBtnTop.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  });

  // ─── Init ────────────────────────────────────────────────────────────────────
  loadUserProfile();
  loadSettings();

})();