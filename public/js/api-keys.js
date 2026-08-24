const user = {};

async function loadBrowserUser() {
    try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
        const session = await response.json();
        if (session.authenticated && session.user) Object.assign(user, session.user);
    } catch (_) {
        // The protected clients request below remains the source of truth.
    }
}

// Load API keys from backend
let apiKeys = [];

// Update UI with user info
document.addEventListener('DOMContentLoaded', async () => {
    // Bind controls before waiting for profile/client requests. A fast click
    // must never be dropped while the initial API data is still loading.
    setupEventListeners();

    await loadBrowserUser();
    if (user.username) {
        document.getElementById('userNameSide').textContent = user.username;
    }
    if (user.email) {
        document.getElementById('userEmailTop').textContent = user.email;
    }
    if (user.role) {
        document.getElementById('userRoleSide').textContent = user.role.toUpperCase();
    }

    // Load API keys from backend
    await fetchApiKeys();
    updateStats();
    
});

async function fetchApiKeys() {
    try {
        const response = await fetch('/api/oauth/clients', {
            headers: {
            }
        });
        const result = await response.json();
        if (response.status === 401) {
            window.location.href = '/login.html?returnTo=%2Fapi-keys.html';
            return;
        }
        if (result.success) {
            // Map backend client data to frontend apiKeys format
            apiKeys = result.data.clients.map(client => ({
                id: client.client_id,
                name: client.client_name,
                clientId: client.client_id,
                scopes: (client.scope || 'openid profile email').split(' '),
                createdAt: client.createdAt,
                lastUsed: client.lastUsed ? formatTimeAgo(client.lastUsed) : 'Never',
                totalRequests: client.totalRequests || 0
            }));
            loadApiKeys();
            updateStats();
        }
    } catch (error) {
        console.error('Fetch keys error:', error);
    }
}

// Format time ago for consistency with other pages
function formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// Setup all event listeners
function setupEventListeners() {
    // Create Key Button
    const createKeyBtn = document.getElementById('createKeyBtn');
    if (createKeyBtn) {
        createKeyBtn.addEventListener('click', openCreateModal);
    }
    
    // Close Create Modal
    const closeCreateModalBtn = document.getElementById('closeCreateModalBtn');
    if (closeCreateModalBtn) {
        closeCreateModalBtn.addEventListener('click', closeCreateModal);
    }
    
    const cancelCreateBtn = document.getElementById('cancelCreateBtn');
    if (cancelCreateBtn) {
        cancelCreateBtn.addEventListener('click', closeCreateModal);
    }
    
    // Submit Create Key
    const submitCreateKeyBtn = document.getElementById('submitCreateKeyBtn');
    if (submitCreateKeyBtn) {
        submitCreateKeyBtn.addEventListener('click', createApiKey);
    }
    
    // Close Secret Modal
    const closeSecretModalBtn = document.getElementById('closeSecretModalBtn');
    if (closeSecretModalBtn) {
        closeSecretModalBtn.addEventListener('click', closeSecretModal);
    }
    
    const confirmSecretBtn = document.getElementById('confirmSecretBtn');
    if (confirmSecretBtn) {
        confirmSecretBtn.addEventListener('click', closeSecretModal);
    }
    
    // Copy buttons in secret modal
    document.querySelectorAll('.secret-copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const elementId = this.getAttribute('data-copy');
            copyToClipboard(elementId);
        });
    });
    
    // Logout
    document.getElementById('logoutBtnTop').addEventListener('click', logout);
}

// Load and display API keys
function loadApiKeys() {
    const container = document.getElementById('apiKeysContainer');
    
    if (apiKeys.length === 0) {
        container.innerHTML = `
            <div class="api-keys-empty">
                <span class="material-symbols-outlined">vpn_key_off</span>
                <p>${typeof t === 'function' ? t('apikeys.noKeys') : 'No OAuth applications yet'}</p>
                <small>${typeof t === 'function' ? t('apikeys.noKeysHint') : 'Register your first application to get started'}</small>
            </div>
        `;
        return;
    }

    container.innerHTML = apiKeys.map(key => `
        <div class="api-key-card">
            <div class="api-key-header">
                <div class="api-key-info">
                    <h3 class="api-key-name">${escapeHtml(key.name)}</h3>
                    <div class="api-key-meta">
                        <span class="api-key-date">Created ${new Date(key.createdAt).toLocaleDateString()}</span>
                        <span class="api-key-date">Last used ${escapeHtml(key.lastUsed || 'Never')}</span>
                    </div>
                </div>
                <div class="api-key-actions">
                    <button class="api-key-action-btn danger" data-action="revoke" data-key-id="${escapeHtml(key.id)}" title="Revoke">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
            <div class="api-key-body">
                <div class="api-key-credential">
                    <span class="api-key-credential-label">${typeof t === 'function' ? t('apikeys.clientId') : 'Client ID'}</span>
                    <div class="api-key-credential-value">
                        <span class="api-key-credential-text">${escapeHtml(key.clientId)}</span>
                        <button class="api-key-credential-btn" data-copy-direct="${escapeHtml(key.clientId)}">
                            <span class="material-symbols-outlined">content_copy</span>
                        </button>
                    </div>
                </div>
                <div class="api-key-credential">
                    <span class="api-key-credential-label">${typeof t === 'function' ? t('apikeys.clientSecret') : 'Client Secret'}</span>
                    <div class="api-key-credential-value">
                        <span class="api-key-credential-text" style="color: var(--text-secondary, #888); font-style: italic;">••••••••••••••••••••••••••••</span>
                        <span style="font-size:0.75rem; color: var(--text-secondary, #888); margin-left:0.5rem;">shown once at creation</span>
                    </div>
                </div>
                <div class="api-key-credential">
                    <span class="api-key-credential-label">${typeof t === 'function' ? t('apikeys.scopes') : 'Scopes'}</span>
                    <div class="api-key-scopes">
                        ${key.scopes.map(scope => `<span class="api-key-scope">${escapeHtml(scope)}</span>`).join('')}
                    </div>
                </div>
                <div class="api-key-usage">
                    <div class="api-key-usage-item">
                        <span class="api-key-usage-label">${typeof t === 'function' ? t('apikeys.totalRequests') : 'Token exchanges'}</span>
                        <span class="api-key-usage-value">${key.totalRequests || 0}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    // Re-attach event listeners for dynamically created elements
    attachDynamicEventListeners();
}

// Attach event listeners to dynamically created elements
function attachDynamicEventListeners() {
    // Action buttons (revoke)
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const keyId = this.getAttribute('data-key-id');
            if (action === 'revoke') {
                revokeKey(keyId);
            }
        });
    });
    
    // Copy buttons
    document.querySelectorAll('[data-copy-direct]').forEach(btn => {
        btn.addEventListener('click', function() {
            const text = this.getAttribute('data-copy-direct');
            copyKeyToClipboard(text, this);
        });
    });
}

// Update statistics
function updateStats() {
    document.getElementById('totalKeys').textContent = apiKeys.length;
    
    if (apiKeys.length > 0) {
        const mostRecent = apiKeys.reduce((prev, current) => 
            (new Date(current.lastUsed || 0) > new Date(prev.lastUsed || 0)) ? current : prev
        );
        document.getElementById('lastUsed').textContent = mostRecent.lastUsed || 'Never';
        
    } else {
        document.getElementById('lastUsed').textContent = 'Never';
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Open create modal
function openCreateModal() {
    const modal = document.getElementById('createModal');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

// Close create modal
function closeCreateModal() {
    const modal = document.getElementById('createModal');
    modal.classList.remove('open');
    document.body.style.overflow = '';
    
    // Reset form
    document.getElementById('keyName').value = '';
    document.getElementById('redirectUris').value = '';
}

// Create API key
async function createApiKey() {
    const name = document.getElementById('keyName').value.trim();
    const redirectUris = document.getElementById('redirectUris').value
        .split(',')
        .map(uri => uri.trim())
        .filter(Boolean);
    // Identity scopes are fixed for the current global-auth product.
    // Resource/API scopes should be added only when the API enforces them.
    const scopes = ['openid', 'profile', 'email'];

    if (!name) {
        showToast(typeof t === 'function' ? t('apikeys.needName') : 'Please enter a key name', 'error');
        return;
    }

    if (name.length > 100) {
        showToast('Application name must be at most 100 characters', 'error');
        return;
    }

    if (redirectUris.length === 0 || redirectUris.some(uri => {
        try {
            const url = new URL(uri);
            const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
            const authServerIsLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
            return uri.length > 2048 || url.hash !== '' || url.username !== '' || url.password !== '' ||
                (url.protocol !== 'https:' && !(authServerIsLocal && url.protocol === 'http:' && isLocalhost));
        } catch {
            return true;
        }
    }) || redirectUris.length > 10) {
        showToast('Enter a valid HTTPS redirect URI (localhost is allowed for local development)', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitCreateKeyBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = typeof t === 'function' ? t('apikeys.creating') : 'CREATING...';

    try {
        const response = await fetch('/api/oauth/clients', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_name: name,
                description: 'OAuth application registered through AuthSys',
                redirect_uris: redirectUris,
                application_type: 'web',
                contact_email: user.email,
                scope: scopes.join(' ')
            })
        });

        const result = await response.json();

        if (result.success) {
            const client = result.data;
            
            // Add to local list for immediate display
            const newKey = {
                id: client.client_id,
                name: client.client_name,
                clientId: client.client_id,
                clientSecret: client.client_secret, // Returned ONLY on creation
                scopes: scopes,
                createdAt: client.created_at || new Date().toISOString(),
                lastUsed: 'Never',
                totalRequests: 0,
                secretVisible: true
            };

            apiKeys.unshift(newKey);

            closeCreateModal();
            
            // Show secret modal
            document.getElementById('newClientId').textContent = newKey.clientId;
            document.getElementById('newClientSecret').textContent = newKey.clientSecret;
            openSecretModal();

            loadApiKeys();
            updateStats();
            
            showToast(typeof t === 'function' ? t('apikeys.created') : 'OAuth application created successfully', 'success');
        } else {
            showToast(result.error || (typeof t === 'function' ? t('apikeys.createFailed') : 'Failed to create OAuth application'), 'error');
        }
    } catch (error) {
        console.error('Create key error:', error);
        showToast(typeof t === 'function' ? t('apikeys.networkError') : 'Network error creating OAuth application', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'GENERATE KEY';
    }
}

// Open secret modal
function openSecretModal() {
    const modal = document.getElementById('secretModal');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

// Close secret modal
function closeSecretModal() {
    const modal = document.getElementById('secretModal');
    modal.classList.remove('open');
    document.body.style.overflow = '';
}


// Copy to clipboard (renamed to avoid conflicts)
function copyKeyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(typeof t === 'function' ? t('apikeys.copied') : 'Copied to clipboard', 'success');

        // Visual feedback
        if (button) {
            const icon = button.querySelector('.material-symbols-outlined');
            const originalIcon = icon.textContent;
            icon.textContent = 'check';
            setTimeout(() => {
                icon.textContent = originalIcon;
            }, 1000);
        }
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Failed to copy', 'error');
    });
}

// Copy from modal
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast(typeof t === 'function' ? t('apikeys.copied') : 'Copied to clipboard', 'success');

        // Visual feedback
        const button = element.parentElement.querySelector('.secret-copy-btn');
        if (button) {
            const icon = button.querySelector('.material-symbols-outlined');
            const originalIcon = icon.textContent;
            icon.textContent = 'check';
            setTimeout(() => {
                icon.textContent = originalIcon;
            }, 1000);
        }
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Failed to copy', 'error');
    });
}

// Revoke key
async function revokeKey(keyId) {
    if (!confirm(typeof t === 'function' ? t('apikeys.revokeConfirm') : '⚠️ Are you sure you want to revoke this OAuth application?\n\nThis action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/oauth/clients/${keyId}`, {
            method: 'DELETE',
            headers: {
            }
        });

        const result = await response.json();

        if (result.success) {
            apiKeys = apiKeys.filter(k => k.id !== keyId);
            loadApiKeys();
            updateStats();
            showToast(typeof t === 'function' ? t('apikeys.revoked') : 'OAuth application revoked', 'success');
        } else {
            showToast(result.error || 'Failed to revoke OAuth application', 'error');
        }
    } catch (error) {
        console.error('Revoke key error:', error);
        showToast(typeof t === 'function' ? t('apikeys.revokeError') : 'Network error revoking OAuth application', 'error');
    }
}

// Toast notification
function showToast(message, type = 'success') {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = type === 'success' ? 'check_circle' : 'error';
    const text = document.createElement('span');
    text.textContent = String(message ?? '');
    toast.append(icon, text);
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Logout
function logout() {
    if (confirm(typeof t === 'function' ? t('apikeys.logoutConfirm') : 'Are you sure you want to logout?')) {
        fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin'
        }).catch(() => {}).finally(() => {
            window.location.href = '/login.html';
        });
    }
}

// Close modal when clicking overlay
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        if (document.getElementById('createModal').classList.contains('open')) {
            closeCreateModal();
        }
        if (document.getElementById('secretModal').classList.contains('open')) {
            closeSecretModal();
        }
    }
});

// Close modal with ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.getElementById('createModal').classList.contains('open')) {
            closeCreateModal();
        }
        if (document.getElementById('secretModal').classList.contains('open')) {
            closeSecretModal();
        }
    }
});
