/**
 * Analytics Controller
 * Real-time analytics and statistics for dashboard
 */

const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const SecurityAudit = require('../../../shared/models/SecurityAudit');
const logger = require('../../../shared/utils/logger');

/**
 * Get user statistics
 * GET /api/dashboard/analytics/users
 */
async function getUserStats(req, res) {
    try {
        const now = new Date();
        const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
        const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);

        // Total users
        const totalUsers = await User.countDocuments();

        // Active users (logged in last 7 days)
        const activeUsers = await User.countDocuments({
            lastLogin: { $gte: last7Days }
        });

        // New users (last 24h, 7d, 30d)
        const newUsers24h = await User.countDocuments({
            createdAt: { $gte: last24Hours }
        });

        const newUsers7d = await User.countDocuments({
            createdAt: { $gte: last7Days }
        });

        const newUsers30d = await User.countDocuments({
            createdAt: { $gte: last30Days }
        });

        // Users by role
        const usersByRole = await User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        logger.info('User stats retrieved');

        res.json({
            success: true,
            data: {
                total: totalUsers,
                active: activeUsers,
                newUsers: {
                    last24h: newUsers24h,
                    last7d: newUsers7d,
                    last30d: newUsers30d
                },
                roles: usersByRole.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                timestamp: now.toISOString()
            }
        });
    } catch (error) {
        logger.error('Get user stats failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get login statistics
 * GET /api/dashboard/analytics/logins
 */
async function getLoginStats(req, res) {
    try {
        const now = new Date();
        const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
        const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);

        // Total login attempts (last 24h)
        const totalLogins24h = await SecurityAudit.countDocuments({
            action: { $in: ['login_success', 'login_failed'] },
            createdAt: { $gte: last24Hours }
        });

        // Successful logins
        const successfulLogins24h = await SecurityAudit.countDocuments({
            action: 'login_success',
            createdAt: { $gte: last24Hours }
        });

        // Failed logins
        const failedLogins24h = await SecurityAudit.countDocuments({
            action: 'login_failed',
            createdAt: { $gte: last24Hours }
        });

        // Success rate
        const successRate = totalLogins24h > 0 
            ? ((successfulLogins24h / totalLogins24h) * 100).toFixed(1) 
            : 100;

        // Login trends (last 7 days)
        const loginTrends = await SecurityAudit.aggregate([
            {
                $match: {
                    action: { $in: ['login_success', 'login_failed'] },
                    createdAt: { $gte: last7Days }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        action: '$action'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.date',
                    successful: {
                        $sum: { $cond: [{ $eq: ['$_id.action', 'login_success'] }, 1, 0] }
                    },
                    failed: {
                        $sum: { $cond: [{ $eq: ['$_id.action', 'login_failed'] }, 1, 0] }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Login methods breakdown
        const loginMethods = await SecurityAudit.aggregate([
            {
                $match: {
                    action: 'login_success',
                    createdAt: { $gte: last24Hours }
                }
            },
            {
                $group: {
                    _id: '$metadata.method',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Currently active sessions
        const activeSessions = await Session.countDocuments({ isActive: true });

        logger.info('Login stats retrieved');

        res.json({
            success: true,
            data: {
                last24h: {
                    total: totalLogins24h,
                    successful: successfulLogins24h,
                    failed: failedLogins24h,
                    successRate
                },
                trends: loginTrends,
                methods: loginMethods.reduce((acc, item) => {
                    acc[item._id || 'password'] = item.count;
                    return acc;
                }, {}),
                activeSessions,
                timestamp: now.toISOString()
            }
        });
    } catch (error) {
        logger.error('Get login stats failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get security statistics
 * GET /api/dashboard/analytics/security
 */
async function getSecurityStats(req, res) {
    try {
        const now = new Date();
        const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
        const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);

        // Account lockouts (last 24h)
        const accountLockouts24h = await SecurityAudit.countDocuments({
            action: 'account_locked',
            createdAt: { $gte: last24Hours }
        });

        // Password changes (last 24h)
        const passwordChanges24h = await SecurityAudit.countDocuments({
            action: 'password_changed',
            createdAt: { $gte: last24Hours }
        });

        // Security events by type (last 24h)
        const eventsByType = await SecurityAudit.aggregate([
            {
                $match: {
                    createdAt: { $gte: last24Hours }
                }
            },
            {
                $group: {
                    _id: '$action',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Failed login attempts by IP (last 24h)
        const failedLoginsByIP = await SecurityAudit.aggregate([
            {
                $match: {
                    action: 'login_failed',
                    createdAt: { $gte: last24Hours },
                    ipAddress: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$ipAddress',
                    count: { $sum: 1 },
                    emails: { $addToSet: '$metadata.email' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Rate limit hits (estimate from failed logins)
        const rateLimitHits = failedLogins24h;

        // Suspicious activity (multiple failed logins from same IP)
        const suspiciousActivity = failedLoginsByIP.filter(ip => ip.count >= 5).length;

        logger.info('Security stats retrieved');

        res.json({
            success: true,
            data: {
                last24h: {
                    accountLockouts: accountLockouts24h,
                    passwordChanges: passwordChanges24h,
                    rateLimitHits,
                    suspiciousActivity
                },
                eventsByType: eventsByType.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                topFailedIPs: failedLoginsByIP,
                timestamp: now.toISOString()
            }
        });
    } catch (error) {
        logger.error('Get security stats failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get API statistics
 * GET /api/dashboard/analytics/api-stats
 */
async function getAPIStats(req, res) {
    try {
        const now = new Date();
        const last24Hours = new Date(now - 24 * 60 * 60 * 1000);

        // Total API calls (estimate from security audit)
        const totalAPICalls = await SecurityAudit.countDocuments({
            createdAt: { $gte: last24Hours }
        });

        // Active tokens (sessions)
        const activeTokens = await Session.countDocuments({ isActive: true });

        // Revoked tokens (last 24h)
        const revokedTokens = await SecurityAudit.countDocuments({
            action: { $in: ['logout', 'token_revoked'] },
            createdAt: { $gte: last24Hours }
        });

        // OAuth clients
        const OAuthClient = require('../../../shared/models/Client');
        const oauthClients = await OAuthClient.countDocuments();

        logger.info('API stats retrieved');

        res.json({
            success: true,
            data: {
                last24h: {
                    totalCalls: totalAPICalls,
                    activeTokens,
                    revokedTokens
                },
                oauth: {
                    clients: oauthClients
                },
                timestamp: now.toISOString()
            }
        });
    } catch (error) {
        logger.error('Get API stats failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get recent activity feed
 * GET /api/dashboard/analytics/activity
 */
async function getActivity(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const activities = await SecurityAudit.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await SecurityAudit.countDocuments();

        logger.info('Activity feed retrieved');

        res.json({
            success: true,
            data: {
                activities,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                },
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Get activity failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get geographic data
 * GET /api/dashboard/analytics/geographic
 */
async function getGeographicData(req, res) {
    try {
        // Group users by IP prefix (simplified geographic data)
        const usersByIP = await SecurityAudit.aggregate([
            {
                $match: {
                    action: 'login_success',
                    ipAddress: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$ipAddress',
                    count: { $sum: 1 },
                    userIds: { $addToSet: '$userId' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 20 }
        ]);

        logger.info('Geographic data retrieved');

        res.json({
            success: true,
            data: {
                byIP: usersByIP,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Get geographic data failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    getUserStats,
    getLoginStats,
    getSecurityStats,
    getAPIStats,
    getActivity,
    getGeographicData
};
