(() => {
  'use strict';

  function clearAuthSysAccountStorage() {
    ['recentEvents', 'userProfile', 'lastLogin', 'theme', 'language', 'emailNotif', 'loginAlerts']
      .forEach((key) => localStorage.removeItem(key));
    sessionStorage.removeItem('userProfile');
  }

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
  const authorizedAppsList = document.getElementById('authorizedAppsList');

  // ─── Auth Check ──────────────────────────────────────────────────────────────

  let hasPassword = true; // safe default until profile loads
  let authProvider = null;

  // ─── Load User Profile ───────────────────────────────────────────────────────
  async function loadUserProfile() {
    try {
      const res = await fetch('/api/auth/profile', {
        credentials: 'same-origin'
      });

      if (res.status === 401) {
        window.location.href = '/login.html?returnTo=' + encodeURIComponent(window.location.pathname);
        return;
      }
      if (!res.ok) throw new Error('Failed to load profile');

      const data = await res.json();
      const user = data.data;

      userEmailTop.textContent = user.email;
      userNameSide.textContent = user.username;
      userRoleSide.textContent = user.role.toUpperCase();
      hasPassword = data.data?.hasPassword ?? true;
      authProvider = data.data?.provider || null;

    } catch (error) {
      console.error('Load profile error:', error);
      showAlert(typeof t === 'function' ? t('settings.loadFailed') : 'Failed to load profile', 'error');
    }
  }

  // ─── Load Settings ───────────────────────────────────────────────────────────
  async function loadSettings() {
    try {
      // Load from backend
      const res = await fetch('/api/auth/preferences', {
        credentials: 'same-origin'
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

  async function loadAuthorizedApps() {
    if (!authorizedAppsList) return;
    try {
      const res = await fetch('/api/oauth/consents', {
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load applications');

      const consents = data.data?.consents || [];
      if (consents.length === 0) {
        authorizedAppsList.innerHTML = `<div class="settings-item"><div class="settings-item-info"><span class="settings-item-label">No authorized applications</span><span class="settings-item-desc">Applications will appear here after you approve a sign-in request.</span></div></div>`;
        return;
      }

      authorizedAppsList.innerHTML = consents.map((consent) => {
        const expires = consent.expires_at ? new Date(consent.expires_at).toLocaleDateString() : 'unknown';
        const scopes = String(consent.scope || '').split(/\s+/).filter(Boolean).map(escapeHtml).join(', ');
        return `<div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">${escapeHtml(consent.client_name)}</span>
            <span class="settings-item-desc">Scopes: ${scopes || 'none'} · Expires: ${expires}</span>
          </div>
          <button class="btn btn-danger btn-sm" data-revoke-consent="${escapeHtml(consent.client_id)}">Revoke</button>
        </div>`;
      }).join('');

      authorizedAppsList.querySelectorAll('[data-revoke-consent]').forEach((button) => {
        button.addEventListener('click', () => revokeConsent(button.dataset.revokeConsent));
      });
    } catch (error) {
      console.error('Load authorized applications error:', error);
      authorizedAppsList.innerHTML = `<div class="settings-item"><div class="settings-item-info"><span class="settings-item-label">Unable to load authorized applications</span></div></div>`;
    }
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  async function revokeConsent(clientId) {
    if (!confirm('Revoke this application\'s access? You will need to approve it again next time.')) return;
    try {
      const res = await fetch(`/api/oauth/consents/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke access');
      await loadAuthorizedApps();
      showAlert('Application access revoked', 'success');
    } catch (error) {
      showAlert(error.message, 'error');
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
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'auto' && prefersDark);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const el = document.getElementById('lighttheme-css');
    if (el) el.disabled = (theme !== 'light');
  }

  // ─── Save Settings ───────────────────────────────────────────────────────────
  async function saveSettings() {
    try {
      saveSettingsBtn.disabled = true;
      saveSettingsBtn.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span> ${typeof t === 'function' ? t('settings.saving') : 'Saving...'}`;

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

      showAlert(typeof t === 'function' ? t('settings.saveSuccess') : 'Settings saved successfully', 'success');

    } catch (error) {
      console.error('Save settings error:', error);
      showAlert(typeof t === 'function' ? t('settings.saveFailed') : 'Failed to save settings', 'error');
    } finally {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.innerHTML = `<span class="material-symbols-outlined">save</span> ${typeof t === 'function' ? t('settings.saveBtn') : 'Save Changes'}`;
    }
  }

  function getOAuthProvider() {
    return authProvider;
  }
  function getProviderLabel(provider) {
    if (provider === 'google') return 'Google';
    if (provider === 'github') return 'GitHub';
    return 'your provider';
  }

  // ─── Delete Account ──────────────────────────────────────────────────────────
  function deleteAccount(reauthToken = null) {
    if (!hasPassword) {
      if (reauthToken) {
        showDeleteAccountConfirmModal(reauthToken);
      } else {
        showDeleteAccountReauthModal();
      }
      return;
    }
    const _t = typeof t === 'function' ? t : (k) => k;
    const modalHTML = `
      <div class="modal open" id="deleteAccountModal">
        <div class="modal-overlay" data-close-modal></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">
              <span class="material-symbols-outlined" style="color: var(--error); vertical-align: middle; margin-right: 0.5rem;">warning</span>
              ${_t('settings.deleteTitle')}
            </h3>
            <button class="modal-close" data-close-modal>
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div class="modal-body">
            <div class="secret-warning">
              <span class="material-symbols-outlined">warning</span>
              <p>
                <strong>${_t('settings.deleteWarning')}</strong><br>
                ${_t('settings.deleteWarningDesc')}
              </p>
            </div>

            <div id="deleteAlert" class="alert" style="display: none; margin-bottom: 1rem;"></div>

            <form id="deleteAccountForm">
              ${hasPassword ? `
              <div class="form-group">
                <label for="deletePassword" class="input-label">
                  ${_t('settings.deletePasswordLabel')}
                </label>
                <input
                  type="password"
                  id="deletePassword"
                  class="input"
                  placeholder="${_t('settings.deletePasswordPlaceholder')}"
                  required
                  autofocus
                />
                <p class="text-xs text-on-surface-variant" style="margin-top: 0.5rem;">
                  ${_t('settings.deletePasswordHint')}
                </p>
              </div>` : ''}

              <div class="modal-footer" style="margin-top: 1.5rem; padding: 0; border: none; background: none;">
                <button type="button" class="btn btn-ghost" data-close-modal>
                  ${_t('settings.deleteCancel')}
                </button>
                <button type="submit" class="btn btn-danger" id="confirmDeleteBtn">
                  <span class="material-symbols-outlined">delete_forever</span>
                  ${_t('settings.deleteConfirmBtn')}
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

  function showDeleteAccountReauthModal() {
    const _t = typeof t === 'function' ? t : (k) => k;
    const provider = getOAuthProvider();
    const providerLabel = getProviderLabel(provider);
    const providerPath = provider === 'github' ? '/api/auth/github' : '/api/auth/google';
    const returnTo = window.location.pathname;

    const modalHTML = `
      <div class="modal open" id="deleteAccountModal">
        <div class="modal-overlay" data-close-modal></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">
              <span class="material-symbols-outlined" style="color: var(--error); vertical-align: middle; margin-right: 0.5rem;">warning</span>
              ${_t('settings.deleteTitle')}
            </h3>
            <button class="modal-close" data-close-modal>
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="modal-body">
            <div class="secret-warning">
              <span class="material-symbols-outlined">warning</span>
              <p>
                <strong>${_t('settings.deleteWarning')}</strong><br>
                ${_t('settings.deleteWarningDesc')}
              </p>
            </div>
            <p style="margin: 1rem 0 0.5rem; font-size: 0.95rem;">
              To confirm your identity, please verify with <strong>${providerLabel}</strong> before deleting your account.
            </p>
            <div class="modal-footer" style="margin-top: 1.5rem; padding: 0; border: none; background: none;">
              <button type="button" class="btn btn-ghost" data-close-modal>
                ${_t('settings.deleteCancel')}
              </button>
              <button type="button" class="btn btn-danger" id="verifyWithProviderBtn">
                <span class="material-symbols-outlined">verified_user</span>
                Verify with ${providerLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.classList.add('modal-open');

    const modal = document.getElementById('deleteAccountModal');
    modal.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', closeDeleteModal);
    });

    document.getElementById('verifyWithProviderBtn').addEventListener('click', () => {
      window.location.href = `${providerPath}?action=delete_account&returnTo=${encodeURIComponent(returnTo)}`;
    });
  }

  function showDeleteAccountConfirmModal(reauthToken) {
    const _t = typeof t === 'function' ? t : (k) => k;

    const modalHTML = `
      <div class="modal open" id="deleteAccountModal">
        <div class="modal-overlay" data-close-modal></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">
              <span class="material-symbols-outlined" style="color: var(--error); vertical-align: middle; margin-right: 0.5rem;">warning</span>
              ${_t('settings.deleteTitle')}
            </h3>
            <button class="modal-close" data-close-modal>
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="modal-body">
            <div class="secret-warning" style="border-color: var(--success, #22c55e);">
              <span class="material-symbols-outlined" style="color: var(--success, #22c55e);">verified</span>
              <p style="color: var(--success, #22c55e);">
                <strong>Identity Verified</strong><br>
                Your identity has been confirmed. This action is permanent and cannot be undone.
              </p>
            </div>
            <div id="deleteAlert" class="alert" style="display: none; margin-bottom: 1rem;"></div>
            <form id="deleteAccountForm">
              <div class="form-group">
                <label for="finalDeleteConfirmation" class="input-label">${_t('settings.deletePasswordLabel') || 'Type DELETE to confirm'}</label>
                <input type="text" id="finalDeleteConfirmation" class="input"
                  placeholder="DELETE" autocomplete="off" autofocus />
              </div>
              <div class="modal-footer" style="margin-top: 1.5rem; padding: 0; border: none; background: none;">
                <button type="button" class="btn btn-ghost" data-close-modal>
                  ${_t('settings.deleteCancel')}
                </button>
                <button type="submit" class="btn btn-danger" id="confirmDeleteBtn" disabled>
                  <span class="material-symbols-outlined">delete_forever</span>
                  ${_t('settings.deleteConfirmBtn')}
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
    const confirmInput = document.getElementById('finalDeleteConfirmation');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    modal.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', closeDeleteModal);
    });

    confirmInput.addEventListener('input', () => {
      confirmBtn.disabled = confirmInput.value.trim() !== 'DELETE';
    });

    document.getElementById('deleteAccountForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const _t2 = typeof t === 'function' ? t : (k) => k;
      if (confirmInput.value.trim() !== 'DELETE') return;

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span> ${_t2('settings.deleting')}`;

      try {
        const res = await fetch('/api/auth/delete-account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reauth_token: reauthToken })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete account');

        showModalAlert(_t2('settings.deleteSuccess'), 'success');
        setTimeout(() => {
          clearAuthSysAccountStorage();
          window.location.href = '/login.html?deleted=true';
        }, 2000);
      } catch (error) {
        showModalAlert(error.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span class="material-symbols-outlined">delete_forever</span> ${_t2('settings.deleteConfirmBtn')}`;
      }
    });
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
    const _t = typeof t === 'function' ? t : (k) => k;

    const passwordEl = document.getElementById('deletePassword');
    const password = passwordEl ? passwordEl.value : '';
    const submitBtn = document.getElementById('confirmDeleteBtn');

    if (hasPassword && !password) {
      showModalAlert(_t('settings.deletePassError'), 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span> ${_t('settings.deleting')}`;

    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }

      showModalAlert(_t('settings.deleteSuccess'), 'success');
      
      setTimeout(() => {
        clearAuthSysAccountStorage();
        window.location.href = '/login.html?deleted=true';
      }, 2000);

    } catch (error) {
      console.error('Delete account error:', error);
      showModalAlert(error.message, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span class="material-symbols-outlined">delete_forever</span> ${_t('settings.deleteConfirmBtn')}`;
    }
  }


  
function applyTheme(theme) {
  const html = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'auto' && prefersDark);

  if (isDark) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }

  const el = document.getElementById('lighttheme-css');
  if (el) el.disabled = (theme !== 'light');
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
    fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin'
    }).catch(() => {}).finally(() => {
      window.location.href = '/login.html';
    });
  });

  // ─── Init ────────────────────────────────────────────────────────────────────
  async function init() {
    await loadUserProfile();
    loadSettings();
    loadAuthorizedApps();
    // Handle OAuth re-auth callback for account deletion
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'delete_account' && urlParams.get('verified') === '1') {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (hasPassword) deleteAccount();
      else showDeleteAccountConfirmModal(null);
    }
  }
  init();

})();
