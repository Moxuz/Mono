// public/js/user-activity.js

// Check authentication
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

if (!token) {
    window.location.href = '/login.html';
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatTimeAgo(date) {
    if (!date) return 'UNKNOWN';
    
    const now = new Date();
    const activity = new Date(date);
    const diffMs = now - activity;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'JUST_NOW';
    if (diffMins < 60) return `${diffMins}M_AGO`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}H_AGO`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}D_AGO`;
}

function getDeviceIcon(deviceInfo) {
    const device = deviceInfo?.device?.toLowerCase() || '';
    
    if (device.includes('mobile') || device.includes('android') || device.includes('iphone')) {
        return 'smartphone';
    }
    if (device.includes('tablet') || device.includes('ipad')) {
        return 'tablet';
    }
    return 'computer';
}

function maskIP(ip) {
    if (!ip || ip === 'unknown') return 'UNKNOWN_IP';
    if (ip.includes('*')) return ip;
    
    const parts = ip.split('.');
    if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.***.***`;
    }
    return ip.substring(0, 10) + '***';
}

function showToast(message, type = 'success') {
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

// ============================================
// ACTIVE SESSIONS
// ============================================

async function loadActiveSessions() {
    const grid = document.getElementById('sessionsGrid');
    const revokeAllBtn = document.getElementById('revokeAllOthersBtn');
    
    if (!grid) return;
    
    try {
        const response = await sessionService.getSessions();
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to load sessions');
        }
        
        const sessions = response.data?.sessions || [];
        
        grid.innerHTML = '';
        
        if (sessions.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--on-surface-variant);">
                    <span class="material-symbols-outlined" style="font-size: 4rem; color: var(--outline-variant); display: block; margin-bottom: 1rem;">devices_off</span>
                    <p style="font-family: var(--font-mono); font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em;">NO_ACTIVE_SESSIONS</p>
                </div>
            `;
            if (revokeAllBtn) revokeAllBtn.style.display = 'none';
            return;
        }
        
        const otherSessions = sessions.filter(s => !s.isCurrent);
        if (revokeAllBtn) {
            revokeAllBtn.style.display = otherSessions.length > 0 ? 'inline-flex' : 'none';
        }
        
        sessions.forEach(session => {
            const card = createSessionCard(session);
            grid.appendChild(card);
        });
        
    } catch (error) {
        console.error('Load sessions error:', error);
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--error);">
                <span class="material-symbols-outlined" style="font-size: 4rem; display: block; margin-bottom: 1rem;">error</span>
                <p style="font-family: var(--font-mono); font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em;">FAILED_TO_LOAD_SESSIONS</p>
                <button class="action-btn" style="margin-top: 1rem; font-size: 0.75rem; padding: 0.5rem 1rem;" id="retrySessionsBtn">RETRY</button>
            </div>
        `;
        
        const retryBtn = document.getElementById('retrySessionsBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', loadActiveSessions);
        }
    }
}

function createSessionCard(session) {
    const card = document.createElement('div');
    card.className = 'session-card';
    if (session.isCurrent) {
        card.classList.add('current');
    }
    
    const deviceIcon = getDeviceIcon(session.deviceInfo);
    const maskedIP = maskIP(session.ipAddress);
    const timeAgo = formatTimeAgo(session.lastActiveAt);
    
    const location = session.location && (session.location.city || session.location.country)
        ? `${session.location.city || ''}${session.location.city && session.location.country ? ', ' : ''}${session.location.country || ''}`
        : 'UNKNOWN_LOCATION';
    
    const browser = session.deviceInfo?.browser || 'UNKNOWN';
    const os = session.deviceInfo?.os || 'UNKNOWN';
    const device = session.deviceInfo?.device || 'DESKTOP';
    const sessionIdShort = session.id ? session.id.substring(0, 8).toUpperCase() : 'UNKNOWN';
    
    card.innerHTML = `
        <div class="session-header">
            <div class="session-device">
                <div class="session-icon">
                    <span class="material-symbols-outlined">${deviceIcon}</span>
                </div>
                <div class="session-info">
                    <h4>${browser} • ${os}</h4>
                    <p>${device}</p>
                </div>
            </div>
            ${session.isCurrent ? `
                <span class="session-badge">
                    <span class="material-symbols-outlined">check_circle</span>
                    CURRENT
                </span>
            ` : ''}
        </div>
        
        <div class="session-details">
            <div class="session-detail">
                <span class="material-symbols-outlined">location_on</span>
                <span><strong>LOCATION:</strong> ${location}</span>
            </div>
            <div class="session-detail">
                <span class="material-symbols-outlined">language</span>
                <span><strong>IP:</strong> ${maskedIP}</span>
            </div>
            <div class="session-detail">
                <span class="material-symbols-outlined">schedule</span>
                <span><strong>LAST_ACTIVE:</strong> ${timeAgo}</span>
            </div>
        </div>
        
        <div class="session-footer">
            <span class="session-time">SESSION_ID: ${sessionIdShort}</span>
            ${!session.isCurrent ? `
                <button class="session-revoke-btn" data-session-id="${session.id}">
                    <span class="material-symbols-outlined">delete</span>
                    TERMINATE
                </button>
            ` : ''}
        </div>
    `;
    
    if (!session.isCurrent) {
        const revokeBtn = card.querySelector('.session-revoke-btn');
        if (revokeBtn) {
            revokeBtn.addEventListener('click', () => revokeSessionHandler(session.id));
        }
    }
    
    return card;
}

async function revokeSessionHandler(sessionId) {
    if (!confirm('⚠️ TERMINATE THIS SESSION?\n\nThis action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await sessionService.revokeSession(sessionId);
        
        if (response.success) {
            showToast('Session terminated successfully', 'success');
            await loadActiveSessions();
        } else {
            throw new Error(response.error || 'Failed to terminate session');
        }
    } catch (error) {
        console.error('Revoke session error:', error);
        showToast('Failed to terminate session: ' + error.message, 'error');
    }
}

async function revokeAllOtherSessionsHandler() {
    if (!confirm('⚠️ TERMINATE ALL OTHER SESSIONS?\n\nYou will be logged out from all other devices.\nThis action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await sessionService.revokeAllOtherSessions();
        
        if (response.success) {
            showToast(response.message || 'All other sessions terminated', 'success');
            await loadActiveSessions();
        } else {
            throw new Error(response.error || 'Failed to terminate sessions');
        }
    } catch (error) {
        console.error('Revoke all sessions error:', error);
        
        if (error.message.includes('session not found') || error.message.includes('Current session not found')) {
            const shouldRelogin = confirm(
                '⚠️ Session Management Not Available\n\n' +
                'Your current login session is not tracked in the system.\n\n' +
                'This may happen if:\n' +
                '• You logged in before session tracking was enabled\n' +
                '• Your session expired and was removed\n\n' +
                'Would you like to logout and login again to enable full session management?'
            );
            
            if (shouldRelogin) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
            }
        } else {
            showToast('Failed to terminate sessions: ' + error.message, 'error');
        }
    }
}

// ============================================
// SECURITY AUDIT LOGS
// ============================================

async function loadAuditLogs() {
    const tbody = document.getElementById('activityLog');
    if (!tbody) return;
    
    // 🆕 แสดง loading state
    tbody.innerHTML = `
        <tr>
            <td colspan="5" style="text-align: center; padding: 3rem;">
                <div class="loading-spinner" style="margin: 0 auto 1rem;"></div>
                <p style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em;">LOADING_AUDIT_LOGS...</p>
            </td>
        </tr>
    `;
    
    try {
        console.log('🔄 Loading audit logs...');
        
        const response = await fetch('/api/auth/security-audit', {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('📡 Audit logs response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ Audit logs data:', data);

        if (!data.success || !data.data) {
            throw new Error(data.error || 'Failed to load audit logs');
        }

        tbody.innerHTML = '';

        if (data.data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 3rem; color: var(--on-surface-variant);">
                        <span class="material-symbols-outlined" style="font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 1rem;">receipt_long</span>
                        <p style="font-family: var(--font-mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;">NO_SECURITY_EVENTS_FOUND</p>
                    </td>
                </tr>
            `;
            return;
        }

        // 🆕 เก็บ logs data ไว้ใน attribute เพื่อใช้กับ VIEW_TRACE
        data.data.forEach((log, index) => {
            const date = new Date(log.createdAt).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            const isSuccess = log.status === 'success' || (!log.action.includes('failed') && !log.action.includes('blocked'));
            
            // ใช้ ipHelper ถ้ามี
            const displayIP = typeof cleanIPAddress === 'function' 
                ? cleanIPAddress(log.ip) 
                : log.ip;
            
            const row = document.createElement('tr');
            row.className = 'audit-row';
            row.dataset.logId = log._id || index; // เก็บ ID สำหรับ reference
            
            row.innerHTML = `
                <td class="audit-timestamp">${date}</td>
                <td>
                    <span class="audit-status ${isSuccess ? 'success' : 'failed'}">
                        ${isSuccess ? 'SUCCESS' : 'FAILED'}
                    </span>
                </td>
                <td class="audit-ip">${displayIP}</td>
                <td class="audit-message">
                    <span class="${isSuccess ? 'audit-event-type' : 'text-error'}">${log.action}</span>
                    ${log.details ? '<br><span style="font-size: 0.7rem; opacity: 0.7;">' + log.details + '</span>' : ''}
                </td>
                <td style="text-align: right;">
                    <button class="view-trace-btn" data-log-index="${index}">
                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">visibility</span>
                        VIEW_TRACE
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
        });

        // 🆕 เพิ่ม event listeners สำหรับปุ่ม VIEW_TRACE ทั้งหมด
        const traceButtons = tbody.querySelectorAll('.view-trace-btn');
        traceButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const logIndex = parseInt(this.dataset.logIndex);
                const logData = data.data[logIndex];
                viewTrace(logData);
            });
        });

    } catch (error) {
        console.error('❌ Failed to fetch audit logs:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 3rem; color: var(--error);">
                    <span class="material-symbols-outlined" style="font-size: 3rem; display: block; margin-bottom: 1rem;">error</span>
                    <p style="font-family: var(--font-mono); font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.5rem;">FAILED_TO_LOAD_AUDIT_LOGS</p>
                    <span style="font-size: 0.75rem; color: var(--on-surface-variant);">${error.message}</span>
                    <br><br>
                    <button class="action-btn" style="font-size: 0.75rem; padding: 0.5rem 1rem;" onclick="loadAuditLogs()">
                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">refresh</span>
                        RETRY
                    </button>
                </td>
            </tr>
        `;
    }
}

function exportLogs() {
    showToast('Exporting logs...', 'success');
    
    fetch('/api/auth/security-audit', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success || !data.data) {
            throw new Error('No data to export');
        }
        
        const dataStr = JSON.stringify(data.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `authsys-audit-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('✅ Logs exported successfully', 'success');
    })
    .catch(error => {
        console.error('Export error:', error);
        showToast('❌ Failed to export logs: ' + error.message, 'error');
    });
}

function viewTrace(logData) {
    if (!logData) {
        showToast('No trace data available', 'error');
        return;
    }
    
    // สร้าง trace content
    const traceInfo = {
        'Log ID': logData._id || 'N/A',
        'Timestamp': new Date(logData.createdAt).toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }),
        'Action': logData.action,
        'Status': logData.status,
        'IP Address': logData.ip,
        'User Agent': logData.userAgent || 'N/A',
        'Details': logData.details || 'N/A',
        'User ID': logData.userId || 'N/A'
    };
    
    const isSuccess = logData.status === 'success' || logData.status === 'SUCCESS';
    
    // สร้าง modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'trace-modal-overlay';
    
    // สร้าง modal
    const modal = document.createElement('div');
    modal.className = 'trace-modal';
    
    // Modal Header
    const header = document.createElement('div');
    header.className = 'trace-modal-header';
    header.innerHTML = `
        <div class="trace-modal-title">
            <span class="material-symbols-outlined">bug_report</span>
            <h3>Security Trace Log</h3>
        </div>
        <div class="trace-modal-actions">
            <button class="trace-modal-btn" id="copyTraceBtn">
                <span class="material-symbols-outlined">content_copy</span>
                Copy
            </button>
            <button class="trace-modal-btn trace-modal-btn-close" id="closeTraceBtn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
    `;
    
    // Modal Body
    const body = document.createElement('div');
    body.className = 'trace-modal-body';
    
    // Trace Info Grid
    let infoHTML = '<div class="trace-info-grid">';
    for (const [key, value] of Object.entries(traceInfo)) {
        let displayValue = value;
        
        // Special formatting for status
        if (key === 'Status') {
            displayValue = `<span class="trace-status-badge ${!isSuccess ? 'failed' : ''}">${value.toUpperCase()}</span>`;
        }
        
        infoHTML += `
            <div class="trace-info-item">
                <div class="trace-info-label">${key}</div>
                <div class="trace-info-value">${displayValue}</div>
            </div>
        `;
    }
    infoHTML += '</div>';
    
    // Raw Data Section
    const rawData = JSON.stringify(logData, null, 2);
    infoHTML += `
        <div class="trace-raw-section">
            <div class="trace-raw-title">
                <span class="material-symbols-outlined">code</span>
                Raw Data (JSON)
            </div>
            <div class="trace-raw-data">${escapeHtml(rawData)}</div>
        </div>
    `;
    
    body.innerHTML = infoHTML;
    
    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Event Listeners
    const closeBtn = document.getElementById('closeTraceBtn');
    const copyBtn = document.getElementById('copyTraceBtn');
    
    // Close modal function
    function closeModal() {
        overlay.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => {
            document.body.removeChild(overlay);
            document.body.style.overflow = '';
        }, 200);
    }
    
    // Close button click
    closeBtn.addEventListener('click', closeModal);
    
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
    
    // Copy button click
    copyBtn.addEventListener('click', async () => {
        const traceText = generateTraceText(traceInfo, rawData);
        
        try {
            await navigator.clipboard.writeText(traceText);
            
            // Visual feedback
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = `
                <span class="material-symbols-outlined">check</span>
                Copied!
            `;
            
            showToast('Trace data copied to clipboard', 'success');
            
            // Reset button after 2 seconds
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = `
                    <span class="material-symbols-outlined">content_copy</span>
                    Copy
                `;
            }, 2000);
        } catch (error) {
            console.error('Copy failed:', error);
            showToast('Failed to copy to clipboard', 'error');
        }
    });
    
    console.log('📋 Trace Data:', logData);
}

// Helper function: Generate trace text for copy
function generateTraceText(traceInfo, rawData) {
    let text = '═══════════════════════════════════════\n';
    text += '          SECURITY TRACE LOG\n';
    text += '═══════════════════════════════════════\n\n';
    
    for (const [key, value] of Object.entries(traceInfo)) {
        // Remove HTML tags from status
        const cleanValue = typeof value === 'string' ? value.replace(/<[^>]*>/g, '') : value;
        text += `${key.toUpperCase().padEnd(15)} : ${cleanValue}\n`;
    }
    
    text += '\n═══════════════════════════════════════\n';
    text += 'RAW_DATA:\n';
    text += '═══════════════════════════════════════\n\n';
    text += rawData;
    
    return text;
}

// Helper function: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 🆕 ฟังก์ชัน refresh ที่แสดง feedback
async function refreshDataWithFeedback() {
    const refreshBtn = document.getElementById('refreshLogsBtn');
    
    // แสดง loading state
    if (refreshBtn) {
        refreshBtn.disabled = true;
        const originalHTML = refreshBtn.innerHTML;
        refreshBtn.innerHTML = `
            <span class="material-symbols-outlined" style="font-size: 0.875rem; animation: spin 0.8s linear infinite;">refresh</span>
            REFRESHING...
        `;
        
        try {
            await Promise.all([
                loadActiveSessions(),
                loadAuditLogs()
            ]);
            
            showToast('Data refreshed successfully', 'success');
        } catch (error) {
            showToast('Failed to refresh data', 'error');
        } finally {
            // คืนค่าปุ่ม
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = originalHTML;
            }
        }
    }
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Update UI
    if (user.username) {
        document.getElementById('userNameSide').textContent = user.username;
    }
    if (user.email) {
        document.getElementById('userEmailTop').textContent = user.email;
    }
    if (user.role) {
        document.getElementById('userRoleSide').textContent = user.role.toUpperCase();
    }
    
    // Load data
    await loadActiveSessions();
    await loadAuditLogs();
    
    // Event listeners
    const revokeAllBtn = document.getElementById('revokeAllOthersBtn');
    if (revokeAllBtn) {
        revokeAllBtn.addEventListener('click', revokeAllOtherSessionsHandler);
    }
    
    const exportBtn = document.getElementById('exportLogsBtn');
    if (exportBtn) {
        exportBtn.innerHTML = `
            <span class="material-symbols-outlined" style="font-size: 0.875rem;">download</span>
            EXPORT_JSON
        `;
        exportBtn.addEventListener('click', exportLogs);
    }

    const refreshBtn = document.getElementById('refreshLogsBtn');
    if (refreshBtn) {
        refreshBtn.innerHTML = `
            <span class="material-symbols-outlined" style="font-size: 0.875rem;">refresh</span>
            REFRESH_STREAM
        `;
        refreshBtn.addEventListener('click', refreshDataWithFeedback);
    }
            
    const logoutBtn = document.getElementById('logoutBtnTop');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Auto-refresh sessions every 30 seconds
    setInterval(() => {
        loadActiveSessions();
        loadAuditLogs();
    }, 30000);
});

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }
}

// Export functions to window for inline onclick handlers
window.viewTrace = viewTrace;
window.loadAuditLogs = loadAuditLogs;