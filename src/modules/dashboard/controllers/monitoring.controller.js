const SecurityAudit = require('../../../shared/models/SecurityAudit');
const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const mongoose = require('mongoose');
const logger = require('../../../shared/utils/logger');
const os = require('os');
const { broadcastMetrics } = require('../../../shared/utils/websocket');
const kafkaLogger = require('../../../shared/utils/kafkaLogger');
const { isRedisReady } = require('../../../shared/middleware/rateLimiter');
const config = require('../../../shared/config/config');
const { recordLoginAttempt, recordActiveUser, getSnapshot } = require('../services/realtimeMetrics.service');
const { parsePagination } = require('../../../shared/utils/pagination');
const { sanitizeAuditMetadata } = require('../../../shared/utils/auditIdentity');

/**
 * Get real-time monitoring data
 * GET /api/dashboard/monitoring/realtime
 */
async function getRealTimeMonitoring(req, res) {
    try {
        // Active users (last 30 minutes)
        const { activeUsersCount, recentAttempts } = getSnapshot();

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

        const redisRequired = config.REDIS_REQUIRED || config.USE_REDIS_SESSIONS;
        const kafkaEnabled = config.USE_KAFKA_LOGGING;
        const dependencies = {
            mongodb: {
                status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
            },
            redis: {
                status: isRedisReady() ? 'connected' : redisRequired ? 'disconnected' : 'memory'
            },
            kafka: (() => {
                const status = kafkaLogger.getStatus();
                return {
                    status: !kafkaEnabled ? 'disabled' : status.connected ? 'connected' : 'disconnected',
                    enabled: status.enabled
                };
            })()
        };

        // Calculate health score
        let healthScore = 100;
        const issues = [];

        if (dependencies.mongodb.status !== 'connected') {
            healthScore -= 35;
            issues.push('MongoDB is disconnected');
        }
        if (dependencies.redis.status === 'disconnected') {
            healthScore -= 25;
            issues.push('Redis is disconnected');
        } else if (dependencies.redis.status === 'memory') {
            issues.push('Redis is unavailable; using in-memory fallback');
        }
        if (dependencies.kafka.status === 'disconnected') {
            healthScore -= 10;
            issues.push('Kafka logging is disconnected');
        }

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
                dependencies,
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
        const parsedHours = Number.parseInt(hours, 10);
        const safeHours = Number.isFinite(parsedHours) && parsedHours > 0 ? Math.min(parsedHours, 24 * 30) : 24;
        const hoursAgo = new Date(Date.now() - (safeHours * 60 * 60 * 1000));

        // Get login attempts grouped by hour
        const loginStats = await SecurityAudit.aggregate([
            {
                $match: {
                    action: { $in: ['login_success', 'login_failed'] },
                    createdAt: { $gte: hoursAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' }
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
                period: `${safeHours} hours`
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
        const parsedHours = Number.parseInt(hours, 10);
        const safeHours = Number.isFinite(parsedHours) && parsedHours > 0 ? Math.min(parsedHours, 24 * 30) : 24;
        const safeLimit = parsePagination(1, limit, 50, 200).limit;
        const hoursAgo = new Date(Date.now() - (safeHours * 60 * 60 * 1000));

        const events = await SecurityAudit.find({
            createdAt: { $gte: hoursAgo }
        })
            .sort({ createdAt: -1 })
            .limit(safeLimit)
            .lean();

        // Group by action type
        const eventCounts = {};
        events.forEach(event => {
            eventCounts[event.action] = (eventCounts[event.action] || 0) + 1;
        });

        res.json({
            success: true,
            data: {
                events: events.map(event => ({
                    ...event,
                    metadata: sanitizeAuditMetadata(event.metadata || {})
                })),
                eventCounts,
                totalEvents: events.length,
                period: `${safeHours} hours`
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
        const successfulLoginsToday = await SecurityAudit.countDocuments({
            action: 'login_success',
            createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
        });

        const failedLoginsToday = await SecurityAudit.countDocuments({
            action: 'login_failed',
            createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
        });
        const totalLoginsToday = successfulLoginsToday + failedLoginsToday;

        // Security events
        const securityEventsToday = await SecurityAudit.countDocuments({
            createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
        });

        const accountLockoutsToday = await SecurityAudit.countDocuments({
            action: 'account_locked',
            createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
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
                    today: totalLoginsToday,
                    successfulToday: successfulLoginsToday,
                    failedToday: failedLoginsToday,
                    successRate: totalLoginsToday > 0
                        ? ((successfulLoginsToday / totalLoginsToday) * 100).toFixed(1)
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
