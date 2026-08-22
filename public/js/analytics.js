/**
 * Analytics Dashboard JavaScript
 * Real-time analytics with Chart.js
 */

let loginTrendChart, loginMethodsChart;
let refreshInterval;

// Get token from storage

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
    // Auto-refresh every 30 seconds
    refreshInterval = setInterval(loadAllData, 30000);
});

/**
 * Load all analytics data
 */
async function loadAllData() {
    await Promise.all([
        loadUserStats(),
        loadLoginStats(),
        loadSecurityStats(),
        loadActivity()
    ]);
    document.getElementById('lastUpdate').textContent = 'Just now';
}

/**
 * Load user statistics
 */
async function loadUserStats() {
    try {
        const response = await fetch('/api/dashboard/analytics/users', {
            credentials: 'same-origin'
        });
        const result = await response.json();

        if (result.success) {
            const data = result.data;
            
            // Update stat cards
            document.getElementById('totalUsers').textContent = data.total.toLocaleString();
            document.getElementById('activeUsers').textContent = data.active.toLocaleString();
            document.getElementById('newUsers24h').textContent = data.newUsers.last24h.toLocaleString();
        }
    } catch (error) {
        console.error('Failed to load user stats:', error);
    }
}

/**
 * Load login statistics
 */
async function loadLoginStats() {
    try {
        const response = await fetch('/api/dashboard/analytics/logins', {
            credentials: 'same-origin'
        });
        const result = await response.json();

        if (result.success) {
            const data = result.data;
            
            // Update stat cards
            document.getElementById('loginsToday').textContent = data.last24h.total.toLocaleString();
            document.getElementById('successRate').textContent = data.last24h.successRate + '%';
            document.getElementById('failedLogins').textContent = data.last24h.failed.toLocaleString();
            document.getElementById('activeSessions').textContent = data.activeSessions.toLocaleString();
            
            // Update login trend chart
            updateLoginTrendChart(data.trends);
            
            // Update login methods pie chart
            updateLoginMethodsChart(data.methods);
        }
    } catch (error) {
        console.error('Failed to load login stats:', error);
    }
}

/**
 * Load security statistics
 */
async function loadSecurityStats() {
    try {
        const response = await fetch('/api/dashboard/analytics/security', {
            credentials: 'same-origin'
        });
        const result = await response.json();

        if (result.success) {
            const data = result.data;
            
            document.getElementById('lockouts24h').textContent = data.last24h.accountLockouts.toLocaleString();
            document.getElementById('passwordChanges24h').textContent = data.last24h.passwordChanges.toLocaleString();
            document.getElementById('suspiciousIPs').textContent = data.last24h.suspiciousActivity.toLocaleString();
            
            // Calculate total events
            const total = Object.values(data.eventsByType).reduce((a, b) => a + b, 0);
            document.getElementById('totalEvents').textContent = total.toLocaleString();
        }
    } catch (error) {
        console.error('Failed to load security stats:', error);
    }
}

/**
 * Load recent activity
 */
async function loadActivity() {
    try {
        const response = await fetch('/api/dashboard/analytics/activity?limit=20', {
            credentials: 'same-origin'
        });
        const result = await response.json();

        if (result.success) {
            const container = document.getElementById('activityFeed');
            container.innerHTML = result.data.activities.map(activity => {
                const badgeClass = getActivityBadge(activity.action);
                const icon = getActivityIcon(activity.action);
                return `
                    <div class="activity-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <span class="badge ${escapeHtml(badgeClass)} me-2">${escapeHtml(activity.action.replace(/_/g, ' '))}</span>
                                <small class="text-muted">${escapeHtml(new Date(activity.createdAt).toLocaleString())}</small>
                            </div>
                            <div>
                                <i class="bi ${icon}"></i>
                                <small class="text-muted">${escapeHtml(activity.ipAddress || 'Unknown IP')}</small>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Failed to load activity:', error);
    }
}

/**
 * Get badge class for activity type
 */
function getActivityBadge(action) {
    if (action.includes('success')) return 'badge-login';
    if (action.includes('failed')) return 'badge-failed';
    if (action.includes('locked')) return 'badge-lock';
    return 'bg-secondary';
}

/**
 * Get icon for activity type
 */
function getActivityIcon(action) {
    if (action.includes('login')) return 'bi-box-arrow-in-right';
    if (action.includes('logout')) return 'bi-box-arrow-right';
    if (action.includes('locked')) return 'bi-lock';
    if (action.includes('password')) return 'bi-key';
    return 'bi-activity';
}

/**
 * Update login trend chart
 */
function updateLoginTrendChart(trends) {
    const ctx = document.getElementById('loginTrendChart').getContext('2d');
    
    const labels = trends.map(t => t._id);
    const successful = trends.map(t => t.successful);
    const failed = trends.map(t => t.failed);

    if (loginTrendChart) {
        loginTrendChart.destroy();
    }

    loginTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Successful Logins',
                    data: successful,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Failed Logins',
                    data: failed,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

/**
 * Update login methods pie chart
 */
function updateLoginMethodsChart(methods) {
    const ctx = document.getElementById('loginMethodsChart').getContext('2d');
    
    const labels = Object.keys(methods).map(m => m || 'Password');
    const data = Object.values(methods);

    if (loginMethodsChart) {
        loginMethodsChart.destroy();
    }

    loginMethodsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: [
                    '#4f46e5',
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#3b82f6'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    if (loginTrendChart) {
        loginTrendChart.destroy();
    }
    if (loginMethodsChart) {
        loginMethodsChart.destroy();
    }
});
