let user = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Update user UI (sidebar and topbar)
function updateUserUI() {
    if (user && user.username) {
        const userNameEl = document.getElementById('userNameSide');
        if (userNameEl) userNameEl.textContent = user.username;
    }
    
    if (user && user.email) {
        const userEmailEl = document.getElementById('userEmailTop');
        if (userEmailEl) userEmailEl.textContent = user.email;
    }
    
    if (user && user.role) {
        const userRoleEl = document.getElementById('userRoleSide');
        if (userRoleEl) userRoleEl.textContent = user.role.toUpperCase();
    }
}

// Update Current User Card
function updateCurrentUserCard() {
    if (!user) return;
    
    // Update email
    if (user.email) {
        const emailEl = document.getElementById('dashboardUserEmail');
        if (emailEl) emailEl.textContent = user.email;
    }
    
    // Update user ID (first 10 characters)
    const userId = user.id || user._id;
    if (userId) {
        const shortId = userId.substring(0, 10) + '...';
        const idEl = document.getElementById('dashboardUserId');
        if (idEl) idEl.textContent = `ID: ${shortId}`;
    }
    
    // Update role
    if (user.role) {
        const roleEl = document.getElementById('dashboardUserRole');
        if (roleEl) roleEl.textContent = user.role.toUpperCase();
    }
}

// Load Recent Events from API
async function loadRecentEvents() {
    const tbody = document.getElementById('recentEventsBody');
    if (!tbody) return;
    
    try {
        // Fetch from API
        const response = await fetch('/api/auth/security-audit', {
            headers: {
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.data && data.data.length > 0) {
                // Save to localStorage as cache
                localStorage.setItem('recentEvents', JSON.stringify(data.data));
                
                // Display events
                displayEvents(data.data, tbody);
                return;
            }
        }
        
        // If API fails or no data, try cache
        loadRecentEventsFromCache();
        
    } catch (error) {
        console.error('Failed to fetch events:', error);
        // Load from cache
        loadRecentEventsFromCache();
    }
}

// Load events from localStorage cache
function loadRecentEventsFromCache() {
    const tbody = document.getElementById('recentEventsBody');
    if (!tbody) return;
    
    const cachedEvents = JSON.parse(localStorage.getItem('recentEvents') || '[]');
    
    if (cachedEvents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 3rem; color: var(--on-surface-variant);">
                    ${typeof t === 'function' ? t('dashboard.noEvents') : 'No events recorded yet.'}
                </td>
            </tr>
        `;
        return;
    }
    
    displayEvents(cachedEvents, tbody);
}

function cleanIPForDisplay(ip) {
    if (!ip) return 'unknown';
    
    // Remove IPv6 prefix
    let cleaned = ip.replace(/^::ffff:/i, '');
    
    // Convert special cases
    if (cleaned === '::1' || cleaned === '127.0.0.1') {
        return 'localhost';
    }
    
    // Mask internal IPs
    if (cleaned.startsWith('172.') || cleaned.startsWith('10.')) {
        return 'internal';
    }
    
    return cleaned;
}

// Display events in table
function displayEvents(events, tbody) {
    tbody.innerHTML = '';
    
    events.slice(0, 10).forEach(event => {
        const row = document.createElement('tr');
        row.className = 'activity-row';
        
        const isSuccess = event.action
            ? (!event.action.includes('failed') && !event.action.includes('blocked'))
            : (event.status === 'success');

        const eventName = event.action || event.type || 'unknown.event';

        const ipAddress = cleanIPForDisplay(event.ip);
        
        const timeAgo = formatTimeAgo(event.createdAt || event.timestamp);
        
        row.innerHTML = `
            <td>
                <div class="event-type">
                    <span class="event-indicator ${isSuccess ? '' : 'error'}"></span>
                    <span class="event-name">${escapeHtml(eventName)}</span>
                </div>
            </td>
            <td class="event-ip">${escapeHtml(ipAddress)}</td>
            <td class="event-time">${escapeHtml(timeAgo)}</td>
            <td>
                <span class="status-tag ${isSuccess ? '' : 'status-tag-error'}">${isSuccess ? (typeof t === 'function' ? t('dashboard.status.success') : 'SUCCESS') : (typeof t === 'function' ? t('dashboard.status.failure') : 'FAILURE')}</span>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}
// Export logs
function exportLogs() {
    const events = JSON.parse(localStorage.getItem('recentEvents') || '[]');
    
    if (events.length === 0) {
        alert(typeof t === 'function' ? t('dashboard.noExport') : 'No events to export.');
        return;
    }
    
    // Convert to JSON
    const dataStr = JSON.stringify(events, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    // Create download link
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `authsys-events-${Date.now()}.json`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    // Show confirmation
    showToast(typeof t === 'function' ? t('dashboard.exported') : 'Events exported successfully', 'success');
}

// Toast notification
function showToast(message, type = 'success') {
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




// ============================================
// ACTIVE SESSIONS MANAGEMENT
// ============================================

/**
 * Format time ago (enhanced version)
 */
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

/**
 * Get device icon based on device type
 */
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

/**
 * Mask IP address for privacy
 */
function maskIP(ip) {
    if (!ip || ip === 'unknown') return 'UNKNOWN_IP';
    
    // Already masked from backend
    if (ip.includes('*')) return ip;
    
    const parts = ip.split('.');
    if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.***.***`;
    }
    return ip.substring(0, 10) + '***';
}

/**
 * Load and display active sessions
 */
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
        
        // Clear loading state
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
        
        // Show revoke all button if there are other sessions
        const otherSessions = sessions.filter(s => !s.isCurrent);
        if (revokeAllBtn) {
            revokeAllBtn.style.display = otherSessions.length > 0 ? 'inline-flex' : 'none';
        }
        
        // Create session cards
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
                <button id="retrySessionsBtn" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary); color: var(--on-primary); border: none; border-radius: 4px; cursor: pointer; font-family: var(--font-mono); font-size: 0.75rem; text-transform: uppercase;">RETRY</button>
            </div>
        `;
        document.getElementById('retrySessionsBtn')?.addEventListener('click', loadActiveSessions);
    }
}

/**
 * Create session card element
 */
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
                    <span class="material-symbols-outlined">${escapeHtml(deviceIcon)}</span>
                </div>
                <div class="session-info">
                    <h4>${escapeHtml(browser)} • ${escapeHtml(os)}</h4>
                    <p>${escapeHtml(device)}</p>
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
                <span><strong>LOCATION:</strong> ${escapeHtml(location)}</span>
            </div>
            <div class="session-detail">
                <span class="material-symbols-outlined">language</span>
                <span><strong>IP:</strong> ${escapeHtml(maskedIP)}</span>
            </div>
            <div class="session-detail">
                <span class="material-symbols-outlined">schedule</span>
                <span><strong>LAST_ACTIVE:</strong> ${escapeHtml(timeAgo)}</span>
            </div>
        </div>
        
        <div class="session-footer">
            <span class="session-time">SESSION_ID: ${escapeHtml(sessionIdShort)}</span>
            ${!session.isCurrent ? `
                <button class="session-revoke-btn" data-session-id="${escapeHtml(session.id)}">
                    <span class="material-symbols-outlined">delete</span>
                    TERMINATE
                </button>
            ` : ''}
        </div>
    `;

    if (!session.isCurrent) {
        const revokeButton = card.querySelector('.session-revoke-btn');
        revokeButton?.addEventListener('click', () => revokeSessionHandler(session.id));
    }
    
    return card;
}

/**
 * Revoke specific session (handler for onclick)
 */
async function revokeSessionHandler(sessionId) {
    if (!confirm(typeof t === 'function' ? t('dashboard.confirmTerminate') : '⚠️ TERMINATE THIS SESSION?\n\nThis action cannot be undone.')) {
        return;
    }

    try {
        const response = await sessionService.revokeSession(sessionId);

        if (response.success) {
            showToast(typeof t === 'function' ? t('dashboard.sessionTerminated') : 'Session terminated successfully', 'success');
            await loadActiveSessions(); // Reload sessions
        } else {
            throw new Error(response.error || 'Failed to terminate session');
        }
    } catch (error) {
        console.error('Revoke session error:', error);
        showToast(typeof t === 'function' ? t('dashboard.sessionFailed') : 'Failed to terminate session', 'error');
    }
}

/**
 * Revoke all other sessions (handler for button)
 */
async function revokeAllOtherSessionsHandler() {
    if (!confirm(typeof t === 'function' ? t('dashboard.confirmTerminateAll') : '⚠️ TERMINATE ALL OTHER SESSIONS?\n\nYou will be logged out from all other devices.\nThis action cannot be undone.')) {
        return;
    }

    try {
        const response = await sessionService.revokeAllOtherSessions();

        if (response.success) {
            showToast(response.message || (typeof t === 'function' ? t('dashboard.allTerminated') : 'All other sessions terminated'), 'success');
            await loadActiveSessions(); // Reload sessions
        } else {
            throw new Error(response.error || 'Failed to terminate sessions');
        }
    } catch (error) {
        console.error('Revoke all sessions error:', error);
        showToast(typeof t === 'function' ? t('dashboard.terminateFailed') : 'Failed to terminate sessions', 'error');
    }
}

/**
 * Fetch user profile from API
 */
async function fetchUserProfile() {
    try {
        const response = await fetch('/api/auth/profile', {
            headers: {
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
                user = data.data;
            }
        } else if (response.status === 401) {
            window.location.href = '/login.html';
        } else {
            console.error('Failed to fetch profile:', response.status);
        }
    } catch (error) {
        console.error('Failed to fetch user profile:', error);
    }
}

/**
 * Load and display login activity chart
 */
async function loadLoginActivity() {
    try {
        console.log('🔄 Loading login activity...');
        
        // 🆕 Get user's timezone offset (in minutes)
        const timezoneOffset = new Date().getTimezoneOffset();
        console.log('⏰ Timezone offset:', timezoneOffset, 'minutes');
        
        const response = await fetch(`/api/dashboard/login-activity?offset=${timezoneOffset}`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('📡 Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error Response:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Login activity data:', result);

        if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to load login activity');
        }

        const { days, counts, stats } = result.data;

        // Update total
        const totalEl = document.getElementById('loginTotal');
        if (totalEl) {
            totalEl.textContent = stats.total;
        }

        // Update trend
        const trendEl = document.getElementById('loginTrend');
        if (trendEl) {
            let trendText = '';
            let trendClass = '';

            if (stats.trend === 'up') {
                trendText = typeof t === 'function' ? t('dashboard.trendUp') : '↗ Increasing';
                trendClass = 'metric-trend-up';
            } else if (stats.trend === 'down') {
                trendText = typeof t === 'function' ? t('dashboard.trendDown') : '↘ Decreasing';
                trendClass = 'metric-trend-down';
            } else {
                trendText = typeof t === 'function' ? t('dashboard.trendStable') : '→ Stable';
                trendClass = 'metric-trend-stable';
            }

            trendEl.textContent = trendText;
            trendEl.className = `metric-trend ${trendClass}`;
        }

        // Create chart
        const chartContainer = document.getElementById('loginChart');
        if (chartContainer) {
            chartContainer.innerHTML = createLoginChart(days, counts, stats.max);
        }

        console.log('✅ Login activity loaded successfully');

    } catch (error) {
        console.error('❌ Load login activity error:', error);
        
        // Show error state
        const chartContainer = document.getElementById('loginChart');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--error);">
                    <span class="material-symbols-outlined" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;">error</span>
                    <p style="font-size: 0.75rem;">Failed to load activity</p>
                    <p style="font-size: 0.625rem; margin-top: 0.5rem; color: var(--on-surface-variant);">${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }
}

/**
 * Create login chart HTML
 */
function createLoginChart(days, counts, maxCount) {
    // Calculate bar heights (percentage of max)
    const maxHeight = 100; // pixels
    const heights = counts.map(count => {
        if (maxCount === 0) return 4; // min height
        return Math.max(4, (count / maxCount) * maxHeight);
    });

    // Generate bars HTML
    const barsHTML = days.map((day, index) => {
        const count = counts[index];
        const height = heights[index];
        const isToday = index === days.length - 1;

        return `
            <div class="login-chart-bar">
                <div class="login-chart-bar-count">${count}</div>
                <div 
                    class="login-chart-bar-fill ${isToday ? 'today' : ''}" 
                    style="height: ${height}px;"
                    data-count="${count}"
                ></div>
                <div class="login-chart-bar-label">${day}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="login-chart-bars">
            ${barsHTML}
        </div>
    `;
}


// Make functions global for onclick handlers
window.revokeSessionHandler = revokeSessionHandler;
window.revokeAllOtherSessionsHandler = revokeAllOtherSessionsHandler;

// ============================================
// UPDATE EXISTING DOMContentLoaded
// ============================================

// แก้ไข DOMContentLoaded ที่มีอยู่ เพิ่ม loadActiveSessions() และ event listener
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Existing code...
        await fetchUserProfile();
        updateUserUI();
        updateCurrentUserCard();
        await loadRecentEvents();
        
        // 🆕 Load Active Sessions
        await loadActiveSessions();
        await loadLoginActivity();
        // Existing event listeners...
        const exportBtn = document.getElementById('exportLogsBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportLogs);
        }
        
        const lockdownBtn = document.getElementById('lockdownBtn');
        if (lockdownBtn) {
            lockdownBtn.addEventListener('click', handleLockdown);
        }
        
        document.getElementById('logoutBtnTop').addEventListener('click', logout);
        
        // 🆕 Revoke All Others button
        const revokeAllBtn = document.getElementById('revokeAllOthersBtn');
        if (revokeAllBtn) {
            revokeAllBtn.addEventListener('click', revokeAllOtherSessionsHandler);
        }
        
        // 🆕 Auto-refresh sessions every 30 seconds
        const sessionPollId = setInterval(loadActiveSessions, 30000);
        window.addEventListener('pagehide', () => clearInterval(sessionPollId));
        
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        updateUserUI();
        updateCurrentUserCard();
        loadRecentEventsFromCache();
    }
});


// Logout
function logout() {
    const confirmed = confirm(typeof t === 'function' ? t('dashboard.logoutConfirm') : 'Are you sure you want to logout?');
    if (confirmed) {
        fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin'
        }).catch(() => {}).finally(() => {
            window.location.href = '/login.html';
        });
    }
}
