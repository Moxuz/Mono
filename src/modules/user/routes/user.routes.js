const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticate, authorize } = require('../../auth/middleware/authenticate');
const userController = require('../controllers/user.controller');
const authController = require('../../auth/controllers/auth.controller');
const authService = require('../../auth/services/auth.service');
const { validate, rules } = require('../../../shared/middleware/validate');
const User = require('../../../shared/models/User');
const Consent = require('../../../shared/models/Consent');
const Client = require('../../../shared/models/Client');
const logger = require('../../../shared/utils/logger');
const { parsePagination } = require('../../../shared/utils/pagination');

/**
 * GET /api/users/profile
 * Get current user profile (PDPA Right to Access)
 */
router.get('/profile', authenticate, userController.getProfile);

/**
 * PUT /api/users/profile
 * Update current user profile
 */
router.put('/profile', authenticate, validate(rules.profile), userController.updateProfile);

/**
 * DELETE /api/users/account
 * Delete user account (PDPA Right to Erasure)
 */
// Keep this PDPA alias subject to the same password/OAuth re-authentication
// policy as /api/auth/delete-account.
router.delete('/account', authenticate, authController.deleteAccount);

/**
 * GET /api/users/export
 * Export user data (PDPA Right to Data Portability)
 */
router.get('/export', authenticate, userController.exportData);

/**
 * GET /api/users/sessions
 * Get active sessions
 */
router.get('/sessions', authenticate, userController.getSessions);

/**
 * GET /api/users/me
 * Get current user info (requires authentication)
 */
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        logger.info('User info retrieved', { userId: user._id });

        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        logger.error('Get user info error:', error);
        next(error);
    }
});

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
    try {
        const pagination = parsePagination(req.query.page, req.query.limit, 10, 100);
        const page = pagination.page;
        const limit = pagination.limit;
        const skip = (page - 1) * limit;

        const users = await User.find()
            .select('_id username email role isActive createdAt lastLogin')
            .skip(skip)
            .limit(limit)
            .sort('-createdAt');

        const total = await User.countDocuments();

        res.json({
            success: true,
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Get all users error:', error);
        next(error);
    }
});

/**
 * GET /api/users/:id
 * Get specific user (admin only)
 */
router.get('/:id', authenticate, authorize('admin'), async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }
        const user = await User.findById(req.params.id)
            .select('_id username email role isActive displayName bio createdAt updatedAt lastLogin');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        logger.error('Get user by id error:', error);
        next(error);
    }
});

/**
 * PUT /api/users/:id
 * Update login identifiers (admin only)
 */
router.put('/:id', authenticate, authorize('admin'), validate(rules.userUpdate), async (req, res, next) => {
    try {
        const userId = req.params.id;
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }

        const allowedUpdates = ['username', 'email'];
        const updates = {};

        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        const user = await User.findByIdAndUpdate(
            userId,
            updates,
            { new: true, runValidators: true }
        ).select('_id username email role isActive displayName bio createdAt updatedAt lastLogin');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        logger.info('User updated', { userId });

        res.json({
            success: true,
            message: 'User updated successfully',
            user
        });
    } catch (error) {
        logger.error('Update user error:', error);
        if (error?.code === 11000) {
            return res.status(409).json({ success: false, error: 'Username or email is already in use' });
        }
        next(error);
    }
});

/**
 * DELETE /api/users/:id
 * Delete user (admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }
        if (String(req.user.id) === String(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: 'Use the account deletion flow to deactivate your own account'
            });
        }

        const ownedClients = await Client.find({ owner: req.params.id })
            .select('client_id')
            .lean();
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Deactivation must invalidate existing access/refresh tokens too;
        // otherwise a later reactivation could revive old credentials.
        await Promise.all([
            authService.blacklistAllUserTokens(user._id, 'admin_revoke'),
            Consent.revokeAllForUser(user._id, 'admin_revoke'),
            Client.updateMany(
                { owner: user._id, isActive: true },
                { $set: { isActive: false } }
            ),
            ...ownedClients.map((client) =>
                Consent.revokeAllForClient(client.client_id, 'client_owner_deactivated')
            )
        ]);

        logger.info('User deactivated', { userId: user._id });

        res.json({
            success: true,
            message: 'User deactivated successfully'
        });
    } catch (error) {
        logger.error('Delete user error:', error);
        next(error);
    }
});

module.exports = router;
