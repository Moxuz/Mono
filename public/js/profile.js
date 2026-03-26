// Check authentication
const token = (localStorage.getItem('token') || sessionStorage.getItem('token'));
const user = JSON.parse((localStorage.getItem('user') || sessionStorage.getItem('user')) || '{}');

if (!token) {
    window.location.href = '/login.html';
}

// Update UI with user info
document.addEventListener('DOMContentLoaded', () => {
    // Sidebar
    if (user.username) {
        document.getElementById('userNameSide').textContent = user.username;
    }
    if (user.email) {
        document.getElementById('userEmailTop').textContent = user.email;
    }
    if (user.role) {
        document.getElementById('userRoleSide').textContent = user.role.toUpperCase();
    }

    // Load profile data
    loadProfileData();

    // Form submission
    document.getElementById('profileForm').addEventListener('submit', handleProfileUpdate);
    
    // ✅ Quick Actions Event Listeners
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', changePassword);
    }
    
    const manageSessionsBtn = document.getElementById('manageSessionsBtn');
    if (manageSessionsBtn) {
        manageSessionsBtn.addEventListener('click', manageSessions);
    }
    
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', deleteAccount);
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtnTop');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});

// Load profile data
function loadProfileData() {
    // Username
    document.getElementById('username').value = user.username || '';
    
    // Email
    document.getElementById('email').value = user.email || '';
    
    // Display Name
    const savedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    document.getElementById('displayName').value = savedProfile.displayName || user.username || '';
    
    // Bio
    document.getElementById('bio').value = savedProfile.bio || '';
    
    // Member Since
    if (user.createdAt) {
        const date = new Date(user.createdAt);
        document.getElementById('memberSince').textContent = date.toLocaleDateString('en-US', { 
            month: 'short', 
            year: 'numeric' 
        });
    }
    
    // Last Login
    const lastLogin = localStorage.getItem('lastLogin');
    if (lastLogin) {
        const date = new Date(lastLogin);
        document.getElementById('lastLogin').textContent = formatRelativeTime(date);
    } else {
        document.getElementById('lastLogin').textContent = typeof t === 'function' ? t('profile.justNow') : 'Just now';
    }
    
    // Active Sessions
    document.getElementById('activeSessions').textContent = '1';
}

// Handle profile update
async function handleProfileUpdate(e) {
    e.preventDefault();
    
    const displayName = document.getElementById('displayName').value.trim();
    const bio = document.getElementById('bio').value.trim();
    
    // Validate bio length
    if (bio.length > 160) {
        showAlert(typeof t === 'function' ? t('profile.bioError') : 'Bio must be 160 characters or less', 'error');
        return;
    }
    
    // Save to localStorage (in real app, would call API)
    const profileData = {
        displayName,
        bio,
        updatedAt: new Date().toISOString()
    };
    
    localStorage.setItem('userProfile', JSON.stringify(profileData));
    
    // Update user object
    user.displayName = displayName;
    localStorage.setItem('user', JSON.stringify(user));
    
    // Update sidebar if display name changed
    if (displayName) {
        document.getElementById('userNameSide').textContent = displayName;
    }
    
    showAlert(typeof t === 'function' ? t('profile.updateSuccess') : 'Profile updated successfully', 'success');
}

// ============================================
// QUICK ACTIONS
// ============================================

// Change Password - open modal
function changePassword() {
    openChangePasswordModal();
}

function openChangePasswordModal() {
    const _t = typeof t === 'function' ? t : (k) => k;

    const overlay = document.createElement('div');
    overlay.className = 'delete-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'delete-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'delete-modal-header';
    header.innerHTML = `
        <div class="delete-modal-title">
            <span class="material-symbols-outlined">lock_reset</span>
            <h3>${_t('profile.changePassModalTitle')}</h3>
        </div>
        <button class="delete-modal-close" id="closeChangePassModal">
            <span class="material-symbols-outlined">close</span>
        </button>
    `;

    // Body
    const body = document.createElement('div');
    body.className = 'delete-modal-body';
    body.innerHTML = `
        <div id="changePassAlert" class="alert" style="display:none; margin-bottom:1rem;"></div>
        <form id="changePassForm">
            <div class="delete-form-group">
                <label for="currentPassword" class="delete-form-label">${_t('profile.currentPassLabel')}</label>
                <input type="password" id="currentPassword" class="delete-form-input"
                    placeholder="${_t('profile.currentPassPlaceholder')}" autocomplete="current-password" required />
            </div>
            <div class="delete-form-group">
                <label for="newPassword" class="delete-form-label">${_t('profile.newPassLabel')}</label>
                <input type="password" id="newPassword" class="delete-form-input"
                    placeholder="${_t('profile.newPassPlaceholder')}" autocomplete="new-password" required />
            </div>
            <div class="delete-form-group">
                <label for="confirmPassword" class="delete-form-label">${_t('profile.confirmPassLabel')}</label>
                <input type="password" id="confirmPassword" class="delete-form-input"
                    placeholder="${_t('profile.confirmPassPlaceholder')}" autocomplete="new-password" required />
            </div>
        </form>
    `;

    // Footer
    const footer = document.createElement('div');
    footer.className = 'delete-modal-footer';
    footer.innerHTML = `
        <button class="delete-modal-btn delete-modal-btn-cancel" id="cancelChangePassBtn">
            <span class="material-symbols-outlined">close</span>
            ${_t('profile.changePassCancel')}
        </button>
        <button class="delete-modal-btn delete-modal-btn-delete" id="confirmChangePassBtn" type="button" style="background: var(--primary);">
            <span class="material-symbols-outlined">lock_reset</span>
            ${_t('profile.changePassBtn')}
        </button>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const closeBtn = document.getElementById('closeChangePassModal');
    const cancelBtn = document.getElementById('cancelChangePassBtn');
    const confirmBtn = document.getElementById('confirmChangePassBtn');
    const alertEl = document.getElementById('changePassAlert');

    function closeModal() {
        overlay.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            document.body.style.overflow = '';
        }, 200);
    }

    function showModalAlert(message, type) {
        alertEl.className = `alert alert-${type}`;
        alertEl.textContent = message;
        alertEl.style.display = 'block';
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    const escHandler = (e) => {
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    confirmBtn.addEventListener('click', async () => {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPasswordVal = document.getElementById('confirmPassword').value;

        if (!currentPassword) { showModalAlert(_t('profile.currentPassRequired'), 'error'); return; }
        if (!newPassword) { showModalAlert(_t('profile.newPassRequired'), 'error'); return; }
        if (newPassword.length < 8) { showModalAlert(_t('profile.newPassShort'), 'error'); return; }
        if (newPassword !== confirmPasswordVal) { showModalAlert(_t('profile.passNoMatch'), 'error'); return; }

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span> ${_t('profile.changing')}`;

        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || data.message || 'Failed to change password');
            }

            showModalAlert(_t('profile.changePassSuccess'), 'success');
            setTimeout(() => closeModal(), 2000);

        } catch (error) {
            showModalAlert(_t('profile.changePassFailed') + ': ' + error.message, 'error');
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `<span class="material-symbols-outlined">lock_reset</span> ${_t('profile.changePassBtn')}`;
        }
    });

    setTimeout(() => document.getElementById('currentPassword')?.focus(), 300);
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('action') === 'changePassword') {
    openChangePasswordModal();
}

// Manage Sessions
function manageSessions() {
    showAlert('Session management coming soon', 'warning');
}



// ============================================
// UTILITIES
// ============================================

// Show alert
function showAlert(message, type = 'success') {
    const alert = document.getElementById('alert');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.style.display = 'block';
    
    setTimeout(() => {
        alert.style.display = 'none';
    }, 5000);
}

// Format relative time
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
}

// Logout
function logout() {
    if (confirm(typeof t === 'function' ? t('profile.logoutConfirm') : 'Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userProfile');
        window.location.href = '/login.html';
    }
}

// Delete Account - เปิด Modal
function deleteAccount() {
    showDeleteAccountModal();
}

// ✅ สร้าง Delete Account Modal
function showDeleteAccountModal() {
    const _t = typeof t === 'function' ? t : (k) => k;
    // สร้าง modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'delete-modal-overlay';

    // สร้าง modal
    const modal = document.createElement('div');
    modal.className = 'delete-modal';

    // Modal Header
    const header = document.createElement('div');
    header.className = 'delete-modal-header';
    header.innerHTML = `
        <div class="delete-modal-title">
            <span class="material-symbols-outlined">warning</span>
            <h3>${_t('profile.deleteTitle')}</h3>
        </div>
        <button class="delete-modal-close" id="closeDeleteModal">
            <span class="material-symbols-outlined">close</span>
        </button>
    `;

    // Modal Body
    const body = document.createElement('div');
    body.className = 'delete-modal-body';
    body.innerHTML = `
        <div class="delete-warning">
            <div class="delete-warning-title">
                <span class="material-symbols-outlined">error</span>
                ${_t('profile.deleteWarningTitle')}
            </div>
            <p class="delete-warning-text">${_t('profile.deleteWarningDesc')}</p>
            <ul class="delete-warning-list">
                <li>${_t('profile.deleteItem1')}</li>
                <li>${_t('profile.deleteItem2')}</li>
                <li>${_t('profile.deleteItem3')}</li>
                <li>${_t('profile.deleteItem4')}</li>
                <li>${_t('profile.deleteItem5')}</li>
            </ul>
        </div>

        <form class="delete-form" id="deleteAccountForm">
            <div class="delete-form-group">
                <label for="deleteConfirmation" class="delete-form-label">
                    ${_t('profile.deleteTypeLabel')}
                </label>
                <input
                    type="text"
                    id="deleteConfirmation"
                    class="delete-form-input"
                    placeholder="DELETE"
                    autocomplete="off"
                    required
                />
                <span class="delete-form-hint">${_t('profile.deleteTypeHint')}</span>
            </div>

            <div class="delete-form-group">
                <label for="deletePassword" class="delete-form-label">
                    ${_t('profile.deletePasswordLabel')}
                </label>
                <input
                    type="password"
                    id="deletePassword"
                    class="delete-form-input"
                    placeholder="${_t('profile.deletePasswordPlaceholder')}"
                    autocomplete="current-password"
                    required
                />
                <span class="delete-form-hint">${_t('profile.deletePasswordHint')}</span>
            </div>
        </form>
    `;

    // Modal Footer
    const footer = document.createElement('div');
    footer.className = 'delete-modal-footer';
    footer.innerHTML = `
        <button class="delete-modal-btn delete-modal-btn-cancel" id="cancelDeleteBtn">
            <span class="material-symbols-outlined">close</span>
            ${_t('profile.deleteCancel')}
        </button>
        <button class="delete-modal-btn delete-modal-btn-delete" id="confirmDeleteBtn" type="button">
            <span class="material-symbols-outlined">delete_forever</span>
            ${_t('profile.deleteConfirmBtn')}
        </button>
    `;
    
    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Get elements
    const closeBtn = document.getElementById('closeDeleteModal');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const deleteForm = document.getElementById('deleteAccountForm');
    const confirmationInput = document.getElementById('deleteConfirmation');
    const passwordInput = document.getElementById('deletePassword');
    
    // Close modal function
    function closeModal() {
        overlay.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
            document.body.style.overflow = '';
        }, 200);
    }
    
    // Close button click
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    // Click outside to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });
    
    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    // Validate inputs
    function validateInputs() {
        const confirmation = confirmationInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (confirmation === 'DELETE' && password.length > 0) {
            confirmBtn.disabled = false;
        } else {
            confirmBtn.disabled = true;
        }
    }
    
    confirmationInput.addEventListener('input', validateInputs);
    passwordInput.addEventListener('input', validateInputs);
    
    // Initial validation
    validateInputs();
    
    // Confirm delete button click
    confirmBtn.addEventListener('click', async () => {
        const confirmation = confirmationInput.value.trim();
        const password = passwordInput.value.trim();
        
        // Validate
        if (confirmation !== 'DELETE') {
            showAlert(_t('profile.deleteTypeError'), 'error');
            return;
        }

        if (!password) {
            showAlert(_t('profile.deletePassError'), 'error');
            return;
        }
        
        // Show loading
        confirmBtn.disabled = true;
        confirmBtn.classList.add('loading');
        confirmBtn.innerHTML = `
            <span class="material-symbols-outlined">refresh</span>
            ${_t('profile.deleting')}
        `;
        
        try {
            // Call API
            const response = await fetch('/api/auth/delete-account', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ password })
            });
            
            const data = await response.json();
            
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to delete account');
            }
            
            // Success
            showAlert(_t('profile.deleteSuccess'), 'success');
            
            // Clear localStorage
            localStorage.clear();
            
            // Close modal
            closeModal();
            
            // Redirect after 2 seconds
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
            
        } catch (error) {
            console.error('Delete account error:', error);
            showAlert(_t('profile.deleteFailed') + ': ' + error.message, 'error');
            
            // Reset button
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('loading');
            confirmBtn.innerHTML = `
                <span class="material-symbols-outlined">delete_forever</span>
                ${_t('profile.deleteConfirmBtn')}
            `;
        }
    });
    
    // Focus first input
    setTimeout(() => {
        confirmationInput.focus();
    }, 300);
}