const SecurityAudit = require('../../../shared/models/SecurityAudit');
const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const logger = require('../../../shared/utils/logger');
const { authorizeRole } = require('../../auth/middleware/authorization');

/**
 * Get all security audit logs with filtering and pagination
 * GET /api/dashboard/logs/security
 */
async function getSecurityLogs(req, res) {
    try {
        const {
            page = 1,
            limit = 20,
            userId,
            action,
            status,
            startDate,
            endDate,
            ipAddress,
            sortBy = 'timestamp',
            sortOrder = 'desc'
        } = req.query;

        // Build filter object
        const filter = {};

        if (userId) filter.userId = userId;
        if (action) filter.action = new RegExp(action, 'i');
        if (status) filter.status = status;
        if (ipAddress) filter.ipAddress = new RegExp(ipAddress, 'i');

        // Date range filter
        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }

        // Sort order
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Get total count
        const total = await SecurityAudit.countDocuments(filter);

        // Get logs with pagination
        const logs = await SecurityAudit.find(filter)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Enrich with user data if userId exists
        const enrichedLogs = await Promise.all(logs.map(async (log) => {
            if (log.userId) {
                const user = await User.findById(log.userId).select('username email');
                return {
                    ...log,
                    userInfo: user ? {
                        username: user.username,
                        email: user.email
                    } : null
                };
            }
            return log;
        }));

        logger.info('Security logs retrieved', {
            count: enrichedLogs.length,
            total,
            page: pageNum
        });

        res.json({
            success: true,
            data: {
                logs: enrichedLogs,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum),
                    hasMore: skip + enrichedLogs.length < total
                }
            }
        });
    } catch (error) {
        logger.error('Get security logs failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get login history with details
 * GET /api/dashboard/logs/logins
 */
async function getLoginHistory(req, res) {
    try {
        const {
            page = 1,
            limit = 50,
            status = 'all',
            startDate,
            endDate
        } = req.query;

        const filter = {
            action: { $in: ['login_success', 'login_failed'] }
        };

        if (status !== 'all') {
            filter.status = status;
        }

        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const total = await SecurityAudit.countDocuments(filter);

        const logins = await SecurityAudit.find(filter)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Enrich with user data
        const enrichedLogins = await Promise.all(logins.map(async (login) => {
            if (login.userId) {
                const user = await User.findById(login.userId).select('username email');
                return {
                    ...login,
                    userInfo: user ? {
                        username: user.username,
                        email: user.email
                    } : null
                };
            }
            return login;
        }));

        res.json({
            success: true,
            data: {
                logins: enrichedLogins,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum)
                }
            }
        });
    } catch (error) {
        logger.error('Get login history failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get failed login attempts (for security monitoring)
 * GET /api/dashboard/logs/failed-logins
 */
async function getFailedLogins(req, res) {
    try {
        const { hours = 24, groupBy = 'ip' } = req.query;

        const hoursAgo = new Date(Date.now() - (parseInt(hours) * 60 * 60 * 1000));

        const filter = {
            action: 'login_failed',
            timestamp: { $gte: hoursAgo }
        };

        const logins = await SecurityAudit.find(filter).lean();

        // Group by IP or email
        const grouped = {};
        logins.forEach(login => {
            const key = groupBy === 'email'
                ? login.metadata?.email || 'unknown'
                : login.ipAddress || 'unknown';

            if (!grouped[key]) {
                grouped[key] = {
                    identifier: key,
                    count: 0,
                    firstAttempt: login.timestamp,
                    lastAttempt: login.timestamp,
                    emails: new Set(),
                    userAgents: new Set()
                };
            }

            grouped[key].count++;
            if (login.timestamp < grouped[key].firstAttempt) {
                grouped[key].firstAttempt = login.timestamp;
            }
            if (login.timestamp > grouped[key].lastAttempt) {
                grouped[key].lastAttempt = login.timestamp;
            }
            if (login.metadata?.email) {
                grouped[key].emails.add(login.metadata.email);
            }
            if (login.userAgent) {
                grouped[key].userAgents.add(login.userAgent);
            }
        });

        // Convert sets to arrays for JSON serialization
        const result = Object.values(grouped).map(item => ({
            ...item,
            emails: Array.from(item.emails),
            userAgents: Array.from(item.userAgents)
        })).sort((a, b) => b.count - a.count);

        res.json({
            success: true,
            data: {
                failedLogins: result,
                totalAttempts: logins.length,
                uniqueSources: result.length,
                period: `${hours} hours`
            }
        });
    } catch (error) {
        logger.error('Get failed logins failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get active sessions across all users
 * GET /api/dashboard/logs/sessions
 */
async function getActiveSessions(req, res) {
    try {
        const { page = 1, limit = 50, userId } = req.query;

        const filter = { isActive: true };
        if (userId) filter.userId = userId;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const total = await Session.countDocuments(filter);

        const sessions = await Session.find(filter)
            .sort({ lastActivity: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Enrich with user data
        const enrichedSessions = await Promise.all(sessions.map(async (session) => {
            const user = await User.findById(session.userId).select('username email');
            return {
                ...session,
                userInfo: user ? {
                    username: user.username,
                    email: user.email
                } : null
            };
        }));

        res.json({
            success: true,
            data: {
                sessions: enrichedSessions,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum)
                }
            }
        });
    } catch (error) {
        logger.error('Get active sessions failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Export security logs to CSV
 * GET /api/dashboard/logs/export
 */
async function exportLogs(req, res) {
    try {
        const { startDate, endDate, action, status } = req.query;

        const filter = {};
        if (action) filter.action = action;
        if (status) filter.status = status;
        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }

        const logs = await SecurityAudit.find(filter).sort({ timestamp: -1 }).limit(1000).lean();

        // Batch fetch user emails to avoid N+1 queries
        const userIds = [...new Set(logs.map(l => l.userId?.toString()).filter(Boolean))];
        const users = await User.find({ _id: { $in: userIds } }).select('email').lean();
        const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u.email]));

        // Convert to CSV format
        const headers = ['Timestamp', 'Action', 'Status', 'User ID', 'Email', 'IP Address', 'User Agent', 'Details'];
        const csvRows = [headers.join(',')];

        for (const log of logs) {
            const emailVal = log.userId ? (userMap[log.userId.toString()] || '') : '';
            const row = [
                log.timestamp?.toISOString() || '',
                log.action || '',
                log.status || '',
                log.userId?.toString() || '',
                emailVal,
                log.ipAddress || '',
                `"${(log.userAgent || '').replace(/"/g, '""')}"`,
                `"${JSON.stringify(log.metadata || {}).replace(/"/g, '""')}"`
            ];
            csvRows.push(row.join(','));
        }

        const csvContent = csvRows.join('\n');

        // Set headers for file download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=security-logs-${timestamp}.csv`);

        logger.info('Security logs exported', { count: logs.length });

        res.send(csvContent);
    } catch (error) {
        logger.error('Export logs failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get dashboard statistics
 * GET /api/dashboard/stats
 */
async function getDashboardStats(req, res) {
    try {
        const now = new Date();
        const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
        const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);

        // Total users
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });

        // Login statistics
        const totalLogins24h = await SecurityAudit.countDocuments({
            action: 'login_success',
            timestamp: { $gte: last24Hours }
        });

        const failedLogins24h = await SecurityAudit.countDocuments({
            action: 'login_failed',
            timestamp: { $gte: last24Hours }
        });

        // Active sessions
        const activeSessions = await Session.countDocuments({ isActive: true });

        // Account lockouts (last 24h)
        const accountLockouts = await SecurityAudit.countDocuments({
            action: 'account_locked',
            timestamp: { $gte: last24Hours }
        });

        // New users (last 7 days)
        const newUsers7d = await User.countDocuments({
            createdAt: { $gte: last7Days }
        });

        // Password changes (last 30 days)
        const passwordChanges = await SecurityAudit.countDocuments({
            action: 'password_changed',
            timestamp: { $gte: last30Days }
        });

        res.json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    newLast7Days: newUsers7d
                },
                logins: {
                    last24Hours: totalLogins24h,
                    failedLast24h: failedLogins24h,
                    successRate: totalLogins24h > 0
                        ? (((totalLogins24h - failedLogins24h) / totalLogins24h) * 100).toFixed(1)
                        : 100
                },
                sessions: {
                    active: activeSessions
                },
                security: {
                    accountLockouts24h: accountLockouts,
                    passwordChanges30d: passwordChanges
                },
                generatedAt: now.toISOString()
            }
        });
    } catch (error) {
        logger.error('Get dashboard stats failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get user activity timeline
 * GET /api/dashboard/logs/user/:userId/activity
 */
async function getUserActivity(req, res) {
    try {
        const { userId } = req.params;
        const { days = 30 } = req.query;

        const daysAgo = new Date(Date.now() - (parseInt(days) * 24 * 60 * 60 * 1000));

        const activities = await SecurityAudit.find({
            userId,
            timestamp: { $gte: daysAgo }
        }).sort({ timestamp: -1 }).lean();

        res.json({
            success: true,
            data: {
                activities,
                period: `${days} days`,
                totalActivities: activities.length
            }
        });
    } catch (error) {
        logger.error('Get user activity failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    getSecurityLogs,
    getLoginHistory,
    getFailedLogins,
    getActiveSessions,
    exportLogs,
    getDashboardStats,
    getUserActivity
};
