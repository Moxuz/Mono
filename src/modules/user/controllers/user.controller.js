const userService = require('../services/user.service');
const logger = require('../../../shared/utils/logger');
const securityAuditService = require('../../../shared/services/securityAudit.service');

/**
 * Get current user profile
 */
exports.getProfile = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const user = await userService.getUserById(userId);

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error('Get profile error:', error);
        res.status(404).json({
            success: false,
            error: 'User not found'
        });
    }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const updateData = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const user = await userService.updateUser(userId, updateData);

        if (req.session?.user) {
            req.session.user.username = user.username;
            req.session.user.email = user.email;
        }

        await securityAuditService.logSecurityEvent({
            userId,
            action: 'profile_updated',
            status: 'success',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { fields: Object.keys(updateData) }
        });

        logger.info('updateProfile: profile updated', { function: 'updateProfile', userId, fields: Object.keys(updateData) });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user
        });
    } catch (error) {
        logger.error('Update profile error:', error);
        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                error: 'Username or email is already in use'
            });
        }
        res.status(400).json({
            success: false,
            error: 'Profile update failed'
        });
    }
};

/**
 * Export user data (PDPA Right to Data Portability)
 */
exports.exportData = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const data = await userService.exportUserData(userId);

        res.json({
            success: true,
            data
        });
    } catch (error) {
        logger.error('Export data error:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to export account data'
        });
    }
};

/**
 * Get active sessions
 */
exports.getSessions = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const sessions = await userService.getUserSessions(userId);

        res.json({
            success: true,
            data: sessions
        });
    } catch (error) {
        logger.error('Get sessions error:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to retrieve sessions'
        });
    }
};
