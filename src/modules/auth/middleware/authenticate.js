const jwt = require('jsonwebtoken');
const config = require('../../../shared/config/config');
const User = require('../../../shared/models/User');
const logger = require('../../../shared/utils/logger');

/**
 * Middleware to authenticate JWT token
 * รองรับทั้ง token จาก /api/auth/login และ /api/oauth/token
 */
exports.authenticate = async (req, res, next) => {
    try {
        // Get token from header or query
        let token = req.headers['authorization'] || req.query.token;
        
        if (!token) {
            console.log('No token provided');
            return res.status(403).json({
                success: false,
                message: 'No token provided'
            });
        }

        // Remove Bearer from token
        if (token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        console.log('Token received:', token.substring(0, 20) + '...');

        // Verify token
        const decoded = jwt.verify(token, config.JWT_SECRET);
        console.log('Token decoded:', decoded);

        // Get user ID from token
        // รองรับทั้ง 'id' (จาก login) และ 'sub' (จาก OAuth)
        const userId = decoded.id || decoded.sub;
        
        if (!userId) {
            console.log('No user ID in token');
            return res.status(401).json({
                success: false,
                message: 'Invalid token format'
            });
        }

        console.log('Looking for user:', userId);

        // Get user from database
        const user = await User.findById(userId);
        
        if (!user) {
            console.log('User not found:', userId);
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!user.isActive) {
            console.log('User is inactive:', userId);
            return res.status(401).json({
                success: false,
                message: 'User account is inactive'
            });
        }

        console.log('User authenticated:', user.email);

        // Attach user to request
        req.user = {
            id: user._id.toString(),
            email: user.email,
            username: user.username,
            role: user.role
        };

        next();
    } catch (error) {
        console.error('Authentication error:', error.message);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

/**
 * Middleware to check user role
 */
exports.authorize = (...roles) => {
    return (req, res, next) => {
        console.log('Checking authorization for roles:', roles);
        console.log('User role:', req.user?.role);
        
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Required role: ' + roles.join(' or ')
            });
        }

        next();
    };
};