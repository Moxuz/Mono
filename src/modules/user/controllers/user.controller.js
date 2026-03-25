const userService = require('../services/user.service');
const logger = require('../../../shared/utils/logger');

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
            error: error.message || 'User not found'
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

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user
        });
    } catch (error) {
        logger.error('Update profile error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Delete user account (PDPA Right to Erasure)
 */
exports.deleteAccount = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const { reason } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const result = await userService.deleteUser(userId, reason || 'user_request');

        res.json({
            success: true,
            message: result.message,
            data: {
                deletedAt: result.deletedAt
            }
        });
    } catch (error) {
        logger.error('Delete account error:', error);
        res.status(400).json({
            success: false,
            error: error.message
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
        res.status(400).json({
            success: false,
            error: error.message
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
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};
