const SecurityAudit = require('../../../shared/models/SecurityAudit');
const Session = require('../../../shared/models/Session');
const User = require('../../../shared/models/User');
const logger = require('../../../shared/utils/logger');
const sessionService = require('../../../shared/services/session.service');

/**
 * Get current user's activity logs
 * GET /api/dashboard/user/activity
 */
async function getUserActivity(req, res) {
    try {
        const userId = req.user.id;
        const { days = 30, page = 1, limit = 20 } = req.query;

        const daysAgo = new Date(Date.now() - (parseInt(days) * 24 * 60 * 60 * 1000));
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const filter = {
            userId,
            timestamp: { $gte: daysAgo }
        };

        const total = await SecurityAudit.countDocuments(filter);

        const activities = await SecurityAudit.find(filter)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        logger.info('User activity retrieved', { userId, count: activities.length });

        res.json({
            success: true,
            data: {
                activities,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum)
                },
                period: `${days} days`
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

/**
 * Get current user's active sessions
 * GET /api/dashboard/user/sessions
 */
async function getUserSessions(req, res) {
    try {
        const userId = req.user.id;
        const currentSessionId = req.session?.sessionId;

        const sessions = await sessionService.getUserSessions(userId, currentSessionId);

        logger.info('User sessions retrieved', { userId, count: sessions.count });

        res.json({
            success: true,
            data: sessions
        });
    } catch (error) {
        logger.error('Get user sessions failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Revoke a specific session
 * POST /api/dashboard/user/sessions/:sessionId/revoke
 */
async function revokeSession(req, res) {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const currentSessionId = req.session?.sessionId;

        // Prevent revoking current session via this endpoint
        if (sessionId === currentSessionId) {
            return res.status(400).json({
                success: false,
                error: 'Cannot revoke current session. Use logout instead.'
            });
        }

        const result = await sessionService.revokeSession(sessionId, userId, 'user_revoked');

        logger.info('Session revoked by user', { userId, sessionId });

        res.json({
            success: true,
            message: 'Session revoked successfully',
            data: result
        });
    } catch (error) {
        logger.error('Revoke session failed:', error.message);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Revoke all other sessions (keep current)
 * POST /api/dashboard/user/sessions/revoke-all
 */
async function revokeAllOtherSessions(req, res) {
    try {
        const userId = req.user.id;
        const currentSessionId = req.session?.sessionId;

        if (!currentSessionId) {
            return res.status(400).json({
                success: false,
                error: 'Current session not found'
            });
        }

        const result = await sessionService.revokeAllOtherSessions(
            userId,
            currentSessionId,
            'user_revoked'
        );

        logger.info('All other sessions revoked', { userId });

        res.json({
            success: true,
            message: 'All other sessions revoked successfully',
            data: result
        });
    } catch (error) {
        logger.error('Revoke all sessions failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get user's security summary
 * GET /api/dashboard/user/security-summary
 */
async function getSecuritySummary(req, res) {
    try {
        const userId = req.user.id;

        // Get recent login history (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const loginHistory = await SecurityAudit.find({
            userId,
            action: { $in: ['login_success', 'login_failed'] },
            timestamp: { $gte: thirtyDaysAgo }
        }).sort({ timestamp: -1 }).limit(10).lean();

        // Get active sessions count
        const sessionsCount = await Session.countDocuments({
            userId,
            isActive: true
        });

        // Get user info
        const user = await User.findById(userId).select(
            'username email emailVerified twoFactorEnabled lastLogin createdAt'
        );

        // Get recent security events
        const securityEvents = await SecurityAudit.find({
            userId,
            action: {
                $in: [
                    'password_changed',
                    'email_verified',
                    'account_locked',
                    '2fa_enabled',
                    '2fa_disabled'
                ]
            },
            timestamp: { $gte: thirtyDaysAgo }
        }).sort({ timestamp: -1 }).limit(5).lean();

        res.json({
            success: true,
            data: {
                user: {
                    username: user.username,
                    email: user.email,
                    emailVerified: user.emailVerified,
                    twoFactorEnabled: user.twoFactorEnabled,
                    lastLogin: user.lastLogin,
                    memberSince: user.createdAt
                },
                sessions: {
                    activeCount: sessionsCount
                },
                recentLogins: loginHistory,
                securityEvents,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Get security summary failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get login history for current user
 * GET /api/dashboard/user/login-history
 */
async function getLoginHistory(req, res) {
    try {
        const userId = req.user.id;
        const { days = 30 } = req.query;

        const daysAgo = new Date(Date.now() - (parseInt(days) * 24 * 60 * 60 * 1000));

        const logins = await SecurityAudit.find({
            userId,
            action: { $in: ['login_success', 'login_failed'] },
            timestamp: { $gte: daysAgo }
        }).sort({ timestamp: -1 }).lean();

        res.json({
            success: true,
            data: {
                logins,
                period: `${days} days`,
                totalLogins: logins.length,
                successfulLogins: logins.filter(l => l.status === 'success').length,
                failedLogins: logins.filter(l => l.status === 'failure').length
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

module.exports = {
    getUserActivity,
    getUserSessions,
    revokeSession,
    revokeAllOtherSessions,
    getSecuritySummary,
    getLoginHistory
};
