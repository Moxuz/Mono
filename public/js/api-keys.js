// Check authentication
const token = (localStorage.getItem('token') || sessionStorage.getItem('token'));
const user = JSON.parse((localStorage.getItem('user') || sessionStorage.getItem('user')) || '{}');

if (!token) {
    window.location.href = '/login.html';
}

// Load API keys from backend
let apiKeys = [];

// Update UI with user info
document.addEventListener('DOMContentLoaded', async () => {
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
    
    // Setup event listeners
    setupEventListeners();
});

async function fetchApiKeys() {
    try {
        const response = await fetch('/api/oauth/clients', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        if (result.success) {
            // Map backend client data to frontend apiKeys format
            apiKeys = result.data.clients.map(client => ({
                id: client.client_id,
                name: client.client_name,
                environment: client.application_type === 'web' ? 'production' : 'development',
                clientId: client.client_id,
                clientSecret: '••••••••••••••••••••••••••••', // Secret not returned in list
                scopes: (client.scope || 'openid profile email').split(' '),
                createdAt: client.createdAt,
                lastUsed: client.lastUsed ? formatTimeAgo(client.lastUsed) : 'Never',
                requests24h: 0,
                totalRequests: client.totalRequests || 0,
                rateLimit: '1000/hr',
                secretVisible: false
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
                <p>${typeof t === 'function' ? t('apikeys.noKeys') : 'No API keys yet'}</p>
                <small>${typeof t === 'function' ? t('apikeys.noKeysHint') : 'Create your first API key to get started'}</small>
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
                        <span class="api-key-env env-${key.environment}">${key.environment}</span>
                        <span class="api-key-date">Created ${new Date(key.createdAt).toLocaleDateString()}</span>
                        <span class="api-key-date">Last used ${key.lastUsed || 'Never'}</span>
                    </div>
                </div>
                <div class="api-key-actions">
                    <button class="api-key-action-btn danger" data-action="revoke" data-key-id="${key.id}" title="Revoke">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
            <div class="api-key-body">
                <div class="api-key-credential">
                    <span class="api-key-credential-label">${typeof t === 'function' ? t('apikeys.clientId') : 'Client ID'}</span>
                    <div class="api-key-credential-value">
                        <span class="api-key-credential-text">${key.clientId}</span>
                        <button class="api-key-credential-btn" data-copy-direct="${key.clientId}">
                            <span class="material-symbols-outlined">content_copy</span>
                        </button>
                    </div>
                </div>
                <div class="api-key-credential">
                    <span class="api-key-credential-label">${typeof t === 'function' ? t('apikeys.clientSecret') : 'Client Secret'}</span>
                    <div class="api-key-credential-value">
                        <span class="api-key-credential-text" id="secret-${key.id}">${key.secretVisible ? key.clientSecret : '••••••••••••••••••••••••••••'}</span>
                        <button class="api-key-credential-btn" data-action="toggle-secret" data-key-id="${key.id}">
                            <span class="material-symbols-outlined">${key.secretVisible ? 'visibility_off' : 'visibility'}</span>
                        </button>
                        <button class="api-key-credential-btn" data-copy-direct="${key.clientSecret}">
                            <span class="material-symbols-outlined">content_copy</span>
                        </button>
                    </div>
                </div>
                <div class="api-key-credential">
                    <span class="api-key-credential-label">${typeof t === 'function' ? t('apikeys.scopes') : 'Scopes'}</span>
                    <div class="api-key-scopes">
                        ${key.scopes.map(scope => `<span class="api-key-scope">${scope}</span>`).join('')}
                    </div>
                </div>
                <div class="api-key-usage">
                    <div class="api-key-usage-item">
                        <span class="api-key-usage-label">${typeof t === 'function' ? t('apikeys.requests') : 'Requests (24h)'}</span>
                        <span class="api-key-usage-value">${key.requests24h || 0}</span>
                    </div>
                    <div class="api-key-usage-item">
                        <span class="api-key-usage-label">${typeof t === 'function' ? t('apikeys.totalRequests') : 'Total Requests'}</span>
                        <span class="api-key-usage-value">${key.totalRequests || 0}</span>
                    </div>
                    <div class="api-key-usage-item">
                        <span class="api-key-usage-label">${typeof t === 'function' ? t('apikeys.rateLimit') : 'Rate Limit'}</span>
                        <span class="api-key-usage-value">${key.rateLimit || '1000/hr'}</span>
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
    // Action buttons (revoke, toggle-secret)
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const keyId = this.getAttribute('data-key-id');
            
            if (action === 'revoke') {
                revokeKey(keyId);
            } else if (action === 'toggle-secret') {
                toggleSecret(keyId);
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
        
        const total24h = apiKeys.reduce((sum, key) => sum + (key.requests24h || 0), 0);
        document.getElementById('requests24h').textContent = total24h.toLocaleString();
    } else {
        document.getElementById('lastUsed').textContent = 'Never';
        document.getElementById('requests24h').textContent = '0';
    }
}

// Generate random string
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
    document.getElementById('keyEnvironment').value = 'development';
    document.querySelectorAll('.scope-checkbox input').forEach(input => {
        input.checked = ['read', 'write'].includes(input.value);
    });
}

// Create API key
async function createApiKey() {
    const name = document.getElementById('keyName').value.trim();
    const environment = document.getElementById('keyEnvironment').value;
    const scopeInputs = document.querySelectorAll('.scope-checkbox input:checked');
    const scopes = Array.from(scopeInputs).map(input => input.value);

    if (!name) {
        showToast(typeof t === 'function' ? t('apikeys.needName') : 'Please enter a key name', 'error');
        return;
    }

    if (scopes.length === 0) {
        showToast(typeof t === 'function' ? t('apikeys.needScope') : 'Please select at least one scope', 'error');
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
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                client_name: name,
                description: `Managed API key for ${environment}`,
                redirect_uris: ['http://localhost:3000/callback'], // Default placeholder
                application_type: environment === 'production' ? 'web' : 'native',
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
                environment: environment,
                clientId: client.client_id,
                clientSecret: client.client_secret, // Returned ONLY on creation
                scopes: scopes,
                createdAt: client.created_at || new Date().toISOString(),
                lastUsed: 'Never',
                requests24h: 0,
                totalRequests: 0,
                rateLimit: '1000/hr',
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
            
            showToast(typeof t === 'function' ? t('apikeys.created') : 'API key created successfully', 'success');
        } else {
            showToast(result.error || (typeof t === 'function' ? t('apikeys.createFailed') : 'Failed to create API key'), 'error');
        }
    } catch (error) {
        console.error('Create key error:', error);
        showToast(typeof t === 'function' ? t('apikeys.networkError') : 'Network error creating API key', 'error');
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

// Toggle secret visibility
function toggleSecret(keyId) {
    const key = apiKeys.find(k => k.id === keyId);
    if (key) {
        key.secretVisible = !key.secretVisible;
        loadApiKeys();
    }
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
    if (!confirm(typeof t === 'function' ? t('apikeys.revokeConfirm') : '⚠️ Are you sure you want to revoke this API key?\n\nThis action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/oauth/clients/${keyId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.success) {
            apiKeys = apiKeys.filter(k => k.id !== keyId);
            loadApiKeys();
            updateStats();
            showToast(typeof t === 'function' ? t('apikeys.revoked') : 'API key revoked', 'success');
        } else {
            showToast(result.error || 'Failed to revoke API key', 'error');
        }
    } catch (error) {
        console.error('Revoke key error:', error);
        showToast(typeof t === 'function' ? t('apikeys.revokeError') : 'Network error revoking API key', 'error');
    }
}

// Toast notification
function showToast(message, type = 'success') {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined">${type === 'success' ? 'check_circle' : 'error'}</span>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Logout
function logout() {
    if (confirm(typeof t === 'function' ? t('apikeys.logoutConfirm') : 'Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
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