const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../auth/middleware/authenticate');
const User = require('../../../shared/models/User');
const logger = require('../../../shared/utils/logger');

/**
 * GET /api/users/me
 * Get current user info (requires authentication)
 */
router.get('/me', authenticate, async (req, res, next) => {
    try {
        console.log('GET /api/users/me called');
        console.log('User from token:', req.user);
        
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const users = await User.find()
            .select('-password')
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
        const user = await User.findById(req.params.id).select('-password');
        
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
 * Update user (own profile or admin)
 */
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const userId = req.params.id;
        
        // Check if user is updating own profile or is admin
        if (req.user.id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You can only update your own profile'
            });
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
        ).select('-password');

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
        next(error);
    }
});

/**
 * DELETE /api/users/:id
 * Delete user (admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
    try {
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