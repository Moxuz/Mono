/**
 * Admin Dashboard JavaScript
 * Handles all admin panel functionality
 */

// Global state
let authToken = null;
let currentUser = null;

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    const token = localStorage.getItem('adminToken');
    const user = JSON.parse(localStorage.getItem('adminUser') || 'null');
    
    if (!token || !user) {
        // Redirect to login
        window.location.href = '/login.html?redirect=admin';
        return;
    }
    
    authToken = token;
    currentUser = user;
    
    // Load dashboard data
    loadDashboardData();
});

// ─────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────
function showSection(sectionName) {
    // Hide all sections
    document.getElementById('dashboard-section').style.display = 'none';
    document.getElementById('users-section').style.display = 'none';
    document.getElementById('sessions-section').style.display = 'none';
    document.getElementById('audit-section').style.display = 'none';
    document.getElementById('oauth-section').style.display = 'none';
    
    // Remove active class from all nav links
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(`${sectionName}-section`).style.display = 'block';
    
    // Add active class to current nav link
    event.target.classList.add('active');
    
    // Load data for section
    switch(sectionName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'users':
            loadUsers();
            break;
        case 'sessions':
            loadSessions();
            break;
        case 'audit':
            loadAuditLogs();
            break;
        case 'oauth':
            loadOAuthClients();
            break;
    }
}

// ─────────────────────────────────────────────────────────────
// Dashboard Data
// ─────────────────────────────────────────────────────────────
async function loadDashboardData() {
    try {
        // Load stats in parallel
        const [usersRes, sessionsRes, oauthRes, auditRes] = await Promise.all([
            apiCall('/api/users'),
            apiCall('/api/auth/sessions'),
            apiCall('/api/oauth/clients'),
            apiCall('/api/auth/audit-logs?limit=50')
        ]);
        
        // Update stats
        document.getElementById('totalUsers').textContent = usersRes.data?.length || 0;
        document.getElementById('activeSessions').textContent = sessionsRes.data?.count || 0;
        document.getElementById('oauthClients').textContent = oauthRes.data?.total || 0;
        
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentAudit = auditRes.data?.logs?.filter(log => new Date(log.timestamp) > last24h) || [];
        document.getElementById('auditEvents').textContent = recentAudit.length;
        
        // Load recent users
        loadRecentUsers(usersRes.data?.slice(0, 5) || []);
        
        // Load recent audit logs
        loadRecentAudit(recentAudit.slice(0, 5));
        
    } catch (error) {
        showAlert('Failed to load dashboard data: ' + error.message, 'danger');
    }
}

function loadRecentUsers(users) {
    const tbody = document.getElementById('recentUsersTable');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.email}</td>
            <td><span class="badge bg-${user.role === 'admin' ? 'danger' : 'primary'}">${user.role}</span></td>
            <td><span class="badge badge-${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>${new Date(user.createdAt).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

function loadRecentAudit(logs) {
    const tbody = document.getElementById('recentAuditTable');
    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>${log.action}</td>
            <td>${log.userId || 'System'}</td>
            <td><span class="badge bg-${log.status === 'success' ? 'success' : 'danger'}">${log.status}</span></td>
            <td>${new Date(log.timestamp).toLocaleString()}</td>
        </tr>
    `).join('');
}

// ─────────────────────────────────────────────────────────────
// User Management
// ─────────────────────────────────────────────────────────────
async function loadUsers() {
    try {
        const response = await apiCall('/api/users');
        const users = response.data || [];
        
        const tbody = document.getElementById('usersTable');
        tbody.innerHTML = users.map(user => `
            <tr>
                <td><small>${user._id}</small></td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td><span class="badge bg-${user.role === 'admin' ? 'danger' : 'primary'}">${user.role}</span></td>
                <td>
                    <span class="badge badge-${user.isActive ? 'active' : 'inactive'}">
                        ${user.isActive ? 'Active' : 'Inactive'}
                    </span>
                    ${user.isLocked() ? '<span class="badge badge-locked">Locked</span>' : ''}
                </td>
                <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</td>
                <td>
                    <button class="btn btn-sm btn-info btn-action" onclick="viewUser('${user._id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-warning btn-action" onclick="toggleUserStatus('${user._id}', ${user.isActive})">
                        <i class="bi bi-${user.isActive ? 'lock' : 'unlock'}"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-action" onclick="deleteUser('${user._id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        showAlert('Failed to load users: ' + error.message, 'danger');
    }
}

async function viewUser(userId) {
    try {
        const response = await apiCall(`/api/users/${userId}`);
        const user = response.data;
        
        const modal = new bootstrap.Modal(document.getElementById('userModal'));
        document.getElementById('userModalContent').innerHTML = `
            <h5>User Details</h5>
            <p><strong>ID:</strong> ${user._id}</p>
            <p><strong>Username:</strong> ${user.username}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Role:</strong> ${user.role}</p>
            <p><strong>Status:</strong> ${user.isActive ? 'Active' : 'Inactive'}</p>
            <p><strong>Last Login:</strong> ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</p>
            <p><strong>Created:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
        `;
        modal.show();
        
    } catch (error) {
        showAlert('Failed to load user details: ' + error.message, 'danger');
    }
}

async function toggleUserStatus(userId, currentStatus) {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this user?`)) {
        return;
    }
    
    try {
        await apiCall(`/api/users/${userId}`, 'PUT', {
            isActive: !currentStatus
        });
        
        showAlert(`User ${!currentStatus ? 'activated' : 'deactivated'} successfully`, 'success');
        loadUsers();
        
    } catch (error) {
        showAlert('Failed to update user: ' + error.message, 'danger');
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }
    
    try {
        await apiCall(`/api/users/${userId}`, 'DELETE');
        showAlert('User deleted successfully', 'success');
        loadUsers();
        
    } catch (error) {
        showAlert('Failed to delete user: ' + error.message, 'danger');
    }
}

// ─────────────────────────────────────────────────────────────
// Session Management
// ─────────────────────────────────────────────────────────────
async function loadSessions() {
    try {
        const response = await apiCall('/api/auth/sessions');
        const sessions = response.data?.sessions || [];
        
        const tbody = document.getElementById('sessionsTable');
        tbody.innerHTML = sessions.map(session => `
            <tr>
                <td><small>${session.sessionId}</small></td>
                <td>${session.userId}</td>
                <td class="session-device">
                    ${session.deviceInfo?.deviceType || 'Unknown'}<br>
                    <small>${session.deviceInfo?.browser || ''} ${session.deviceInfo?.os || ''}</small>
                </td>
                <td>${session.deviceInfo?.ipAddress || 'Unknown'}</td>
                <td>${new Date(session.lastActivity).toLocaleString()}</td>
                <td><span class="badge badge-active">Active</span></td>
                <td>
                    <button class="btn btn-sm btn-danger btn-action" onclick="revokeSession('${session.sessionId}')">
                        <i class="bi bi-x-circle"></i> Revoke
                    </button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        showAlert('Failed to load sessions: ' + error.message, 'danger');
    }
}

async function revokeSession(sessionId) {
    if (!confirm('Are you sure you want to revoke this session? The user will be logged out.')) {
        return;
    }
    
    try {
        await apiCall('/api/auth/sessions/revoke', 'POST', {
            sessionId: sessionId
        });
        
        showAlert('Session revoked successfully', 'success');
        loadSessions();
        
    } catch (error) {
        showAlert('Failed to revoke session: ' + error.message, 'danger');
    }
}

// ─────────────────────────────────────────────────────────────
// Audit Logs
// ─────────────────────────────────────────────────────────────
async function loadAuditLogs() {
    try {
        const filter = document.getElementById('auditFilter').value;
        const response = await apiCall('/api/auth/audit-logs?limit=100');
        let logs = response.data?.logs || [];
        
        if (filter) {
            logs = logs.filter(log => log.action.includes(filter));
        }
        
        const tbody = document.getElementById('auditTable');
        tbody.innerHTML = logs.map(log => `
            <tr class="audit-log">
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td><span class="badge bg-info">${log.action}</span></td>
                <td>${log.userId || 'System'}</td>
                <td><span class="badge bg-${log.status === 'success' ? 'success' : 'danger'}">${log.status}</span></td>
                <td>${log.ipAddress || 'Unknown'}</td>
                <td><small>${JSON.stringify(log.metadata || {})}</small></td>
            </tr>
        `).join('');
        
    } catch (error) {
        showAlert('Failed to load audit logs: ' + error.message, 'danger');
    }
}

// Filter change listener
document.getElementById('auditFilter')?.addEventListener('change', loadAuditLogs);

// ─────────────────────────────────────────────────────────────
// OAuth Client Management
// ─────────────────────────────────────────────────────────────
async function loadOAuthClients() {
    try {
        const response = await apiCall('/api/oauth/clients');
        const clients = response.data?.clients || [];
        
        const tbody = document.getElementById('oauthClientsTable');
        tbody.innerHTML = clients.map(client => `
            <tr>
                <td><small>${client.client_id}</small></td>
                <td>${client.client_name}</td>
                <td>${client.contact_email}</td>
                <td><small>${client.redirect_uris?.join(', ') || 'None'}</small></td>
                <td>${new Date(client.createdAt).toLocaleDateString()}</td>
                <td><span class="badge badge-${client.isActive ? 'active' : 'inactive'}">${client.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <button class="btn btn-sm btn-info btn-action" onclick="viewClient('${client.client_id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-action" onclick="deleteClient('${client.client_id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        showAlert('Failed to load OAuth clients: ' + error.message, 'danger');
    }
}

function showRegisterClientModal() {
    const modal = new bootstrap.Modal(document.getElementById('registerClientModal'));
    modal.show();
}

async function registerClient(event) {
    event.preventDefault();
    
    const formData = {
        client_name: document.getElementById('clientName').value,
        redirect_uris: document.getElementById('redirectUris').value.split(',').map(uri => uri.trim()),
        contact_email: document.getElementById('contactEmail').value,
        client_uri: document.getElementById('clientUri').value,
        logo_uri: document.getElementById('logoUri').value
    };
    
    try {
        const response = await apiCall('/api/oauth/clients', 'POST', formData);
        showAlert('Client registered successfully! Save the client secret - you won\'t see it again!', 'success');
        
        // Show client credentials
        const modal = new bootstrap.Modal(document.getElementById('clientCredentialsModal'));
        document.getElementById('newClientId').textContent = response.data.client_id;
        document.getElementById('newClientSecret').textContent = response.data.client_secret;
        
        bootstrap.Modal.getInstance(document.getElementById('registerClientModal')).hide();
        modal.show();
        
        loadOAuthClients();
        
    } catch (error) {
        showAlert('Failed to register client: ' + error.message, 'danger');
    }
}

async function viewClient(clientId) {
    try {
        const response = await apiCall(`/api/oauth/clients/${clientId}`);
        const client = response.data;
        
        const modal = new bootstrap.Modal(document.getElementById('clientModal'));
        document.getElementById('clientModalContent').innerHTML = `
            <h5>OAuth Client Details</h5>
            <p><strong>Client ID:</strong> ${client.client_id}</p>
            <p><strong>Client Name:</strong> ${client.client_name}</p>
            <p><strong>Contact Email:</strong> ${client.contact_email}</p>
            <p><strong>Redirect URIs:</strong> ${client.redirect_uris?.join(', ') || 'None'}</p>
            <p><strong>Created:</strong> ${new Date(client.createdAt).toLocaleString()}</p>
            <p><strong>Status:</strong> ${client.isActive ? 'Active' : 'Inactive'}</p>
        `;
        modal.show();
        
    } catch (error) {
        showAlert('Failed to load client details: ' + error.message, 'danger');
    }
}

async function deleteClient(clientId) {
    if (!confirm('Are you sure you want to delete this OAuth client? This will break any apps using it.')) {
        return;
    }
    
    try {
        await apiCall(`/api/oauth/clients/${clientId}`, 'DELETE');
        showAlert('OAuth client deleted successfully', 'success');
        loadOAuthClients();
        
    } catch (error) {
        showAlert('Failed to delete client: ' + error.message, 'danger');
    }
}

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(endpoint, options);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Request failed');
    }
    
    return response.json();
}

function showAlert(message, type = 'info') {
    const container = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    container.appendChild(alert);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.location.href = '/login.html';
    }
}

// Export for global access
window.showSection = showSection;
window.loadUsers = loadUsers;
window.viewUser = viewUser;
window.toggleUserStatus = toggleUserStatus;
window.deleteUser = deleteUser;
window.loadSessions = loadSessions;
window.revokeSession = revokeSession;
window.loadAuditLogs = loadAuditLogs;
window.loadOAuthClients = loadOAuthClients;
window.showRegisterClientModal = showRegisterClientModal;
window.registerClient = registerClient;
window.viewClient = viewClient;
window.deleteClient = deleteClient;
window.logout = logout;
