// Check authentication
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

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
    
    const enable2FABtn = document.getElementById('enable2FABtn');
    if (enable2FABtn) {
        enable2FABtn.addEventListener('click', enable2FA);
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
        document.getElementById('lastLogin').textContent = 'Just now';
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
        showAlert('Bio must be 160 characters or less', 'error');
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
    
    showAlert('Profile updated successfully', 'success');
}

// ============================================
// QUICK ACTIONS
// ============================================

// Change Password - Redirect to forgot password page
function changePassword() {
    window.location.href = '/forgot-password.html';
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('action') === 'changePassword') {
  // Open change password modal
  openChangePasswordModal();
}

// Enable 2FA
function enable2FA() {
    showAlert('Two-factor authentication setup coming soon', 'warning');
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
    if (confirm('Are you sure you want to logout?')) {
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
            <h3>Delete Account</h3>
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
                Warning: This action is irreversible!
            </div>
            <p class="delete-warning-text">
                You are about to permanently delete your account. This will remove:
            </p>
            <ul class="delete-warning-list">
                <li>Profile information</li>
                <li>Active sessions</li>
                <li>API keys</li>
                <li>Activity logs</li>
                <li>All associated data</li>
            </ul>
        </div>
        
        <form class="delete-form" id="deleteAccountForm">
            <div class="delete-form-group">
                <label for="deleteConfirmation" class="delete-form-label">
                    Type "DELETE" to confirm
                </label>
                <input 
                    type="text" 
                    id="deleteConfirmation" 
                    class="delete-form-input" 
                    placeholder="DELETE"
                    autocomplete="off"
                    required
                />
                <span class="delete-form-hint">Please type DELETE in capital letters</span>
            </div>
            
            <div class="delete-form-group">
                <label for="deletePassword" class="delete-form-label">
                    Enter your password
                </label>
                <input 
                    type="password" 
                    id="deletePassword" 
                    class="delete-form-input" 
                    placeholder="Your password"
                    autocomplete="current-password"
                    required
                />
                <span class="delete-form-hint">Confirm your identity to proceed</span>
            </div>
        </form>
    `;
    
    // Modal Footer
    const footer = document.createElement('div');
    footer.className = 'delete-modal-footer';
    footer.innerHTML = `
        <button class="delete-modal-btn delete-modal-btn-cancel" id="cancelDeleteBtn">
            <span class="material-symbols-outlined">close</span>
            Cancel
        </button>
        <button class="delete-modal-btn delete-modal-btn-delete" id="confirmDeleteBtn" type="button">
            <span class="material-symbols-outlined">delete_forever</span>
            Delete Account
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
            showAlert('Please type DELETE to confirm', 'error');
            return;
        }
        
        if (!password) {
            showAlert('Please enter your password', 'error');
            return;
        }
        
        // Show loading
        confirmBtn.disabled = true;
        confirmBtn.classList.add('loading');
        confirmBtn.innerHTML = `
            <span class="material-symbols-outlined">refresh</span>
            Deleting...
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
            showAlert('Account deleted successfully. Redirecting...', 'success');
            
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
            showAlert(' Failed to delete account: ' + error.message, 'error');
            
            // Reset button
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('loading');
            confirmBtn.innerHTML = `
                <span class="material-symbols-outlined">delete_forever</span>
                Delete Account
            `;
        }
    });
    
    // Focus first input
    setTimeout(() => {
        confirmationInput.focus();
    }, 300);
}