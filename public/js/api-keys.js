// Check authentication
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

if (!token) {
    window.location.href = '/login.html';
}

// Load API keys from localStorage
let apiKeys = JSON.parse(localStorage.getItem('apiKeys') || '[]');

// Update UI with user info
document.addEventListener('DOMContentLoaded', () => {
    if (user.username) {
        document.getElementById('userNameSide').textContent = user.username;
    }
    if (user.email) {
        document.getElementById('userEmailTop').textContent = user.email;
    }
    if (user.role) {
        document.getElementById('userRoleSide').textContent = user.role.toUpperCase();
    }

    // Load API keys
    loadApiKeys();
    updateStats();
    
    // Setup event listeners
    setupEventListeners();
});

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
                <p>No API keys yet</p>
                <small>Create your first API key to get started</small>
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
                    <button class="api-key-action-btn" data-action="regenerate" data-key-id="${key.id}" title="Regenerate">
                        <span class="material-symbols-outlined">refresh</span>
                    </button>
                    <button class="api-key-action-btn danger" data-action="revoke" data-key-id="${key.id}" title="Revoke">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
            <div class="api-key-body">
                <div class="api-key-credential">
                    <span class="api-key-credential-label">Client ID</span>
                    <div class="api-key-credential-value">
                        <span class="api-key-credential-text">${key.clientId}</span>
                        <button class="api-key-credential-btn" data-copy-direct="${key.clientId}">
                            <span class="material-symbols-outlined">content_copy</span>
                        </button>
                    </div>
                </div>
                <div class="api-key-credential">
                    <span class="api-key-credential-label">Client Secret</span>
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
                    <span class="api-key-credential-label">Scopes</span>
                    <div class="api-key-scopes">
                        ${key.scopes.map(scope => `<span class="api-key-scope">${scope}</span>`).join('')}
                    </div>
                </div>
                <div class="api-key-usage">
                    <div class="api-key-usage-item">
                        <span class="api-key-usage-label">Requests (24h)</span>
                        <span class="api-key-usage-value">${key.requests24h || 0}</span>
                    </div>
                    <div class="api-key-usage-item">
                        <span class="api-key-usage-label">Total Requests</span>
                        <span class="api-key-usage-value">${key.totalRequests || 0}</span>
                    </div>
                    <div class="api-key-usage-item">
                        <span class="api-key-usage-label">Rate Limit</span>
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
    // Action buttons (regenerate, revoke)
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const keyId = this.getAttribute('data-key-id');
            
            if (action === 'regenerate') {
                regenerateKey(keyId);
            } else if (action === 'revoke') {
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
function createApiKey() {
    const name = document.getElementById('keyName').value.trim();
    const environment = document.getElementById('keyEnvironment').value;
    const scopeInputs = document.querySelectorAll('.scope-checkbox input:checked');
    const scopes = Array.from(scopeInputs).map(input => input.value);

    if (!name) {
        showToast('Please enter a key name', 'error');
        return;
    }

    if (scopes.length === 0) {
        showToast('Please select at least one scope', 'error');
        return;
    }

    const prefix = environment === 'production' ? 'pk_live' : 'pk_test';
    const secretPrefix = environment === 'production' ? 'sk_live' : 'sk_test';
    
    const newKey = {
        id: 'key_' + Date.now(),
        name: name,
        environment: environment,
        clientId: `${prefix}_${generateRandomString(32)}`,
        clientSecret: `${secretPrefix}_${generateRandomString(32)}`,
        scopes: scopes,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        requests24h: 0,
        totalRequests: 0,
        rateLimit: '1000/hr',
        secretVisible: false
    };

    apiKeys.unshift(newKey);
    localStorage.setItem('apiKeys', JSON.stringify(apiKeys));

    closeCreateModal();
    
    // Show secret modal
    document.getElementById('newClientId').textContent = newKey.clientId;
    document.getElementById('newClientSecret').textContent = newKey.clientSecret;
    openSecretModal();

    loadApiKeys();
    updateStats();
    
    showToast('API key created successfully', 'success');
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
        localStorage.setItem('apiKeys', JSON.stringify(apiKeys));
        loadApiKeys();
    }
}

// Copy to clipboard (renamed to avoid conflicts)
function copyKeyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
        
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
        showToast('Copied to clipboard', 'success');
        
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

// Regenerate key
function regenerateKey(keyId) {
    if (!confirm('⚠️ Regenerating this key will invalidate the current secret.\n\nAny applications using the old secret will stop working.\n\nContinue?')) {
        return;
    }

    const key = apiKeys.find(k => k.id === keyId);
    if (key) {
        const secretPrefix = key.environment === 'production' ? 'sk_live' : 'sk_test';
        key.clientSecret = `${secretPrefix}_${generateRandomString(32)}`;
        key.secretVisible = true;
        localStorage.setItem('apiKeys', JSON.stringify(apiKeys));
        
        loadApiKeys();
        showToast('API key regenerated successfully', 'success');
    }
}

// Revoke key
function revokeKey(keyId) {
    if (!confirm('⚠️ Are you sure you want to revoke this API key?\n\nThis action cannot be undone.')) {
        return;
    }

    apiKeys = apiKeys.filter(k => k.id !== keyId);
    localStorage.setItem('apiKeys', JSON.stringify(apiKeys));
    
    loadApiKeys();
    updateStats();
    showToast('API key revoked', 'success');
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
    if (confirm('Are you sure you want to logout?')) {
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