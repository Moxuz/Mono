const SecurityAudit = require('../../../shared/models/SecurityAudit');
const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const logger = require('../../../shared/utils/logger');
const os = require('os');
const { broadcastMetrics } = require('../../../shared/utils/websocket');

// In-memory store for real-time metrics (can be replaced with Redis)
let realTimeMetrics = {
    activeUsers: new Map(),
    loginAttempts: [],
    systemMetrics: {
        cpuUsage: 0,
        memoryUsage: 0,
        requestCount: 0,
        errorCount: 0
    }
};

/**
 * Record a login attempt for real-time monitoring
 */
function recordLoginAttempt(success, ipAddress, userId = null) {
    realTimeMetrics.loginAttempts.push({
        timestamp: new Date(),
        success,
        ipAddress,
        userId
    });

    // Keep only last 1000 attempts
    if (realTimeMetrics.loginAttempts.length > 1000) {
        realTimeMetrics.loginAttempts.shift();
    }

    // Broadcast via WebSocket
    broadcastMetrics({
        event: 'login_attempt',
        success,
        timestamp: new Date().toISOString()
    });
}

/**
 * Record active user
 */
function recordActiveUser(userId) {
    realTimeMetrics.activeUsers.set(userId, new Date());

    // Clean up users inactive for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    for (const [uid, lastActive] of realTimeMetrics.activeUsers.entries()) {
        if (lastActive < thirtyMinutesAgo) {
            realTimeMetrics.activeUsers.delete(uid);
        }
    }
}

/**
 * Get real-time monitoring data
 * GET /api/dashboard/monitoring/realtime
 */
async function getRealTimeMonitoring(req, res) {
    try {
        // Active users (last 30 minutes)
        const activeUsersCount = realTimeMetrics.activeUsers.size;

        // Login attempts in last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentAttempts = realTimeMetrics.loginAttempts.filter(
            attempt => attempt.timestamp > fiveMinutesAgo
        );

        const successfulLogins = recentAttempts.filter(a => a.success).length;
        const failedLogins = recentAttempts.filter(a => !a.success).length;

        // System metrics
        const systemMetrics = {
            cpuUsage: process.cpuUsage(),
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            systemMemory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem()
            }
        };

        // Database stats
        const totalUsers = await User.countDocuments();
        const activeSessions = await Session.countDocuments({ isActive: true });

        res.json({
            success: true,
            data: {
                activeUsers: activeUsersCount,
                loginAttempts: {
                    total: recentAttempts.length,
                    successful: successfulLogins,
                    failed: failedLogins,
                    successRate: recentAttempts.length > 0
                        ? ((successfulLogins / recentAttempts.length) * 100).toFixed(1)
                        : 100
                },
                system: {
                    cpuUsage: ((systemMetrics.cpuUsage.user / 1000000) % 100).toFixed(2),
                    memoryUsage: Math.round(systemMetrics.memoryUsage.heapUsed / 1024 / 1024),
                    uptime: Math.round(systemMetrics.uptime),
                    systemMemory: {
                        total: Math.round(systemMetrics.systemMemory.total / 1024 / 1024),
                        free: Math.round(systemMetrics.systemMemory.free / 1024 / 1024),
                        used: Math.round(systemMetrics.systemMemory.used / 1024 / 1024)
                    }
                },
                database: {
                    totalUsers,
                    activeSessions
                },
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Get real-time monitoring failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get system health status
 * GET /api/dashboard/monitoring/health
 */
async function getSystemHealth(req, res) {
    try {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const uptime = process.uptime();

        // Calculate health score
        let healthScore = 100;
        const issues = [];

        // Check memory usage
        const memoryPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        if (memoryPercent > 90) {
            healthScore -= 30;
            issues.push('High memory usage');
        } else if (memoryPercent > 80) {
            healthScore -= 15;
            issues.push('Elevated memory usage');
        }

        // Check uptime (restart recommended after long uptime)
        const uptimeHours = uptime / 3600;
        if (uptimeHours > 720) { // 30 days
            healthScore -= 10;
            issues.push('Long uptime - consider restart');
        }

        // Check system memory
        const systemMem = {
            total: os.totalmem(),
            free: os.freemem()
        };
        const systemMemPercent = ((systemMem.total - systemMem.free) / systemMem.total) * 100;
        if (systemMemPercent > 90) {
            healthScore -= 20;
            issues.push('Critical system memory');
        }

        res.json({
            success: true,
            data: {
                status: healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'warning' : 'critical',
                healthScore,
                issues,
                metrics: {
                    memory: {
                        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                        percent: memoryPercent.toFixed(1)
                    },
                    cpu: {
                        user: Math.round(cpuUsage.user / 1000000),
                        system: Math.round(cpuUsage.system / 1000000)
                    },
                    uptime: {
                        seconds: Math.round(uptime),
                        hours: Math.round(uptime / 3600),
                        days: Math.round(uptime / 86400)
                    },
                    system: {
                        totalMemory: Math.round(systemMem.total / 1024 / 1024),
                        freeMemory: Math.round(systemMem.free / 1024 / 1024),
                        usagePercent: systemMemPercent.toFixed(1)
                    }
                },
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Get system health failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get login attempts chart data
 * GET /api/dashboard/monitoring/login-chart
 */
async function getLoginChartData(req, res) {
    try {
        const { hours = 24 } = req.query;
        const hoursAgo = new Date(Date.now() - (parseInt(hours) * 60 * 60 * 1000));

        // Get login attempts grouped by hour
        const loginStats = await SecurityAudit.aggregate([
            {
                $match: {
                    action: { $in: ['login_success', 'login_failed'] },
                    timestamp: { $gte: hoursAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' }
                    },
                    total: { $sum: 1 },
                    successful: {
                        $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
                    },
                    failed: {
                        $sum: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] }
                    }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        res.json({
            success: true,
            data: {
                stats: loginStats,
                period: `${hours} hours`
            }
        });
    } catch (error) {
        logger.error('Get login chart data failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get security events timeline
 * GET /api/dashboard/monitoring/security-events
 */
async function getSecurityEvents(req, res) {
    try {
        const { hours = 24, limit = 50 } = req.query;
        const hoursAgo = new Date(Date.now() - (parseInt(hours) * 60 * 60 * 1000));

        const events = await SecurityAudit.find({
            timestamp: { $gte: hoursAgo }
        })
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .lean();

        // Group by action type
        const eventCounts = {};
        events.forEach(event => {
            eventCounts[event.action] = (eventCounts[event.action] || 0) + 1;
        });

        res.json({
            success: true,
            data: {
                events,
                eventCounts,
                totalEvents: events.length,
                period: `${hours} hours`
            }
        });
    } catch (error) {
        logger.error('Get security events failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get dashboard metrics summary
 * GET /api/dashboard/monitoring/metrics
 */
async function getMetricsSummary(req, res) {
    try {
        const now = new Date();
        const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
        const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);

        // User statistics
        const totalUsers = await User.countDocuments();
        const newUsersToday = await User.countDocuments({
            createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
        });
        const newUsersWeek = await User.countDocuments({
            createdAt: { $gte: last7Days }
        });

        // Login statistics
        const loginsToday = await SecurityAudit.countDocuments({
            action: 'login_success',
            timestamp: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
        });

        const failedLoginsToday = await SecurityAudit.countDocuments({
            action: 'login_failed',
            timestamp: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
        });

        // Security events
        const securityEventsToday = await SecurityAudit.countDocuments({
            timestamp: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
        });

        const accountLockoutsToday = await SecurityAudit.countDocuments({
            action: 'account_locked',
            timestamp: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
        });

        // Active sessions
        const activeSessions = await Session.countDocuments({ isActive: true });

        res.json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    newToday: newUsersToday,
                    newWeek: newUsersWeek,
                    growth: totalUsers > 0 ? ((newUsersWeek / totalUsers) * 100).toFixed(1) : 0
                },
                logins: {
                    today: loginsToday,
                    failedToday: failedLoginsToday,
                    successRate: loginsToday > 0
                        ? (((loginsToday - failedLoginsToday) / loginsToday) * 100).toFixed(1)
                        : 100
                },
                security: {
                    eventsToday: securityEventsToday,
                    accountLockouts: accountLockoutsToday
                },
                sessions: {
                    active: activeSessions
                },
                timestamp: now.toISOString()
            }
        });
    } catch (error) {
        logger.error('Get metrics summary failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    getRealTimeMonitoring,
    getSystemHealth,
    getLoginChartData,
    getSecurityEvents,
    getMetricsSummary,
    recordLoginAttempt,
    recordActiveUser
};
