const SecurityAudit = require('../../../shared/models/SecurityAudit');
const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const mongoose = require('mongoose');
const config = require('../../../shared/config/config');
const logger = require('../../../shared/utils/logger');
const { hashIdentity, sanitizeAuditMetadata } = require('../../../shared/utils/auditIdentity');
const { authorizeRole } = require('../../auth/middleware/authorization');
const {
    parsePagination,
    escapeRegExp,
    startOfUtcDay,
    endOfUtcDayExclusive
} = require('../../../shared/utils/pagination');

const SECURITY_LOG_SORT_FIELDS = new Set(['createdAt', 'action', 'status', 'ipAddress']);

function invalidObjectId(res, value) {
    if (!value || mongoose.isValidObjectId(value)) return false;
    res.status(400).json({ success: false, error: 'Invalid user ID' });
    return true;
}

function csvCell(value) {
    const stringValue = value === undefined || value === null
        ? ''
        : (typeof value === 'string' ? value : JSON.stringify(value));
    // Spreadsheet programs interpret these prefixes as formulas even inside
    // quoted CSV cells. Prefixing an apostrophe forces plain-text display.
    const safeValue = /^[=+\-@]/.test(stringValue.trimStart())
        ? `'${stringValue}`
        : stringValue;
    return `"${safeValue.replace(/"/g, '""')}"`;
}

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
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build filter object
        const filter = {};

        if (invalidObjectId(res, userId)) return;
        if (userId) filter.userId = userId;
        if (action) filter.action = new RegExp(escapeRegExp(action), 'i');
        if (status) filter.status = status;
        if (ipAddress) filter.ipAddress = new RegExp(escapeRegExp(ipAddress), 'i');

        // Date range filter
        if (startDate || endDate) {
            filter.createdAt = {};
            const start = startOfUtcDay(startDate);
            const end = endOfUtcDayExclusive(endDate);
            if (start) filter.createdAt.$gte = start;
            if (end) filter.createdAt.$lt = end;
        }

        // Sort order
        const sortOptions = {};
        sortOptions[SECURITY_LOG_SORT_FIELDS.has(sortBy) ? sortBy : 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

        // Pagination
        const pagination = parsePagination(page, limit, 50, 100);
        const pageNum = pagination.page;
        const limitNum = pagination.limit;
        const skip = (pageNum - 1) * limitNum;

        // Get total count
        const total = await SecurityAudit.countDocuments(filter);

        // Get logs with pagination
        const logs = await SecurityAudit.find(filter)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Audit logs remain pseudonymous. User identity belongs in the
        // dedicated user directory, not in security-event payloads.
        const enrichedLogs = logs.map(log => ({
            ...log,
            metadata: sanitizeAuditMetadata(log.metadata || {})
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
            error: 'Failed to retrieve security logs'
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
            filter.createdAt = {};
            const start = startOfUtcDay(startDate);
            const end = endOfUtcDayExclusive(endDate);
            if (start) filter.createdAt.$gte = start;
            if (end) filter.createdAt.$lt = end;
        }

        const pagination = parsePagination(page, limit, 50, 100);
        const pageNum = pagination.page;
        const limitNum = pagination.limit;
        const skip = (pageNum - 1) * limitNum;

        const total = await SecurityAudit.countDocuments(filter);

        const logins = await SecurityAudit.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const enrichedLogins = logins.map(login => ({
            ...login,
            metadata: sanitizeAuditMetadata(login.metadata || {})
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
            error: 'Failed to retrieve login history'
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

        const parsedHours = Number.parseInt(hours, 10);
        const safeHours = Number.isFinite(parsedHours) && parsedHours > 0 ? Math.min(parsedHours, 24 * 30) : 24;
        const hoursAgo = new Date(Date.now() - (safeHours * 60 * 60 * 1000));

        const filter = {
            action: 'login_failed',
            createdAt: { $gte: hoursAgo }
        };

        const scanLimit = config.ADMIN_QUERY_LIMIT;
        const logins = await SecurityAudit.find(filter)
            .sort({ createdAt: 1 })
            .limit(scanLimit)
            .lean();

        // Group by IP or email
        const grouped = {};
        logins.forEach(login => {
            const emailHash = login.emailHash ||
                login.metadata?.emailHash ||
                hashIdentity(login.metadata?.email);
            const key = groupBy === 'email'
                ? emailHash || 'unknown'
                : login.ipAddress || 'unknown';

            if (!grouped[key]) {
                grouped[key] = {
                    identifier: key,
                    count: 0,
                    firstAttempt: login.createdAt,
                    lastAttempt: login.createdAt,
                    emailHashes: new Set(),
                    userAgents: new Set()
                };
            }

            grouped[key].count++;
            if (login.createdAt < grouped[key].firstAttempt) {
                grouped[key].firstAttempt = login.createdAt;
            }
            if (login.createdAt > grouped[key].lastAttempt) {
                grouped[key].lastAttempt = login.createdAt;
            }
            if (emailHash) {
                grouped[key].emailHashes.add(emailHash);
            }
            if (login.userAgent) {
                grouped[key].userAgents.add(login.userAgent);
            }
        });

        // Convert sets to arrays for JSON serialization
        const result = Object.values(grouped).map(item => ({
            ...item,
            emailHashes: Array.from(item.emailHashes),
            userAgents: Array.from(item.userAgents)
        })).sort((a, b) => b.count - a.count);

        res.json({
            success: true,
            data: {
                failedLogins: result,
                totalAttempts: logins.length,
                uniqueSources: result.length,
                period: `${safeHours} hours`,
                truncated: logins.length >= scanLimit,
                scanLimit
            }
        });
    } catch (error) {
        logger.error('Get failed logins failed:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve failed-login summary'
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
        if (invalidObjectId(res, userId)) return;
        if (userId) filter.userId = userId;

        const pagination = parsePagination(page, limit, 50, 100);
        const pageNum = pagination.page;
        const limitNum = pagination.limit;
        const skip = (pageNum - 1) * limitNum;

        const total = await Session.countDocuments(filter);

        const sessions = await Session.find(filter)
            .select('-accessTokenHash -refreshTokenHash -refreshTokenFamily')
            .sort({ lastActiveAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        res.json({
            success: true,
            data: {
                sessions,
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
            error: 'Failed to retrieve active sessions'
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
            filter.createdAt = {};
            const start = startOfUtcDay(startDate);
            const end = endOfUtcDayExclusive(endDate);
            if (start) filter.createdAt.$gte = start;
            if (end) filter.createdAt.$lt = end;
        }

        const logs = await SecurityAudit.find(filter).sort({ createdAt: -1 }).limit(1000).lean();

        // Convert to CSV format
        const headers = ['Timestamp', 'Action', 'Status', 'User ID', 'Email Hash', 'IP Address', 'User Agent', 'Details'];
        const csvRows = [headers.map(csvCell).join(',')];

        for (const log of logs) {
            const row = [
                log.createdAt?.toISOString() || '',
                log.action || '',
                log.status || '',
                log.userId?.toString() || '',
                log.emailHash || '',
                log.ipAddress || '',
                log.userAgent || '',
                sanitizeAuditMetadata(log.metadata || {})
            ];
            csvRows.push(row.map(csvCell).join(','));
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
            error: 'Failed to export security logs'
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
        const successfulLogins24h = await SecurityAudit.countDocuments({
            action: 'login_success',
            createdAt: { $gte: last24Hours }
        });

        const failedLogins24h = await SecurityAudit.countDocuments({
            action: 'login_failed',
            createdAt: { $gte: last24Hours }
        });
        const totalLogins24h = successfulLogins24h + failedLogins24h;

        // Active sessions
        const activeSessions = await Session.countDocuments({ isActive: true });

        // Account lockouts (last 24h)
        const accountLockouts = await SecurityAudit.countDocuments({
            action: 'account_locked',
            createdAt: { $gte: last24Hours }
        });

        // New users (last 7 days)
        const newUsers7d = await User.countDocuments({
            createdAt: { $gte: last7Days }
        });

        // Password changes (last 30 days)
        const passwordChanges = await SecurityAudit.countDocuments({
            action: 'password_changed',
            createdAt: { $gte: last30Days }
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
                    successfulLast24h: successfulLogins24h,
                    failedLast24h: failedLogins24h,
                    successRate: totalLogins24h > 0
                        ? ((successfulLogins24h / totalLogins24h) * 100).toFixed(1)
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
            error: 'Failed to retrieve dashboard statistics'
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
        if (invalidObjectId(res, userId)) return;

        const parsedDays = Number.parseInt(days, 10);
        const safeDays = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : 30;
        const pagination = parsePagination(req.query.page, req.query.limit, 50, 100);
        const pageNum = pagination.page;
        const limitNum = pagination.limit;
        const skip = (pageNum - 1) * limitNum;
        const daysAgo = new Date(Date.now() - (safeDays * 24 * 60 * 60 * 1000));

        const filter = {
            userId,
            createdAt: { $gte: daysAgo }
        };
        const [total, activities] = await Promise.all([
            SecurityAudit.countDocuments(filter),
            SecurityAudit.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean()
        ]);

        res.json({
            success: true,
            data: {
                activities: activities.map(activity => ({
                    ...activity,
                    metadata: sanitizeAuditMetadata(activity.metadata || {})
                })),
                period: `${safeDays} days`,
                totalActivities: total,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum)
                }
            }
        });
    } catch (error) {
        logger.error('Get user activity failed:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve user activity'
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
