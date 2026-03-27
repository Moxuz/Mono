// src/modules/auth/middleware/authenticate.js

const jwt = require('jsonwebtoken');
const config = require('../../../shared/config/config');
const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
const logger = require('../../../shared/utils/logger');

// ตรวจสอบ JWT token จาก Authorization header ค้นหา user และอัปเดต session
exports.authenticate = async (req, res, next) => {
    try {
        let token = req.headers['authorization'] || req.query.token;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        if (token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        const isBlacklisted = await TokenBlacklist.isBlacklisted(token);
        if (isBlacklisted) {
            return res.status(401).json({
                success: false,
                message: 'Token has been revoked'
            });
        }

        const decoded = jwt.verify(token, config.JWT_SECRET);

        const userId = decoded.id || decoded.sub;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token format'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'User account is inactive'
            });
        }

        const session = await Session.findOne({
            sessionToken: token,
            isActive: true
        });

        if (session) {
            if (session.isExpired()) {
                await session.revoke('expired');
                return res.status(401).json({
                    success: false,
                    message: 'Session expired',
                    error: 'Session expired'
                });
            }

            try {
                await session.updateLastActive();
            } catch (error) {
                logger.error('Failed to update session activity:', error);
            }

            req.authSession = {
                sessionId: session._id.toString(),
                sessionToken: token
            };
        } else {
            req.authSession = null;
        }

        // Attach user to request
        req.user = {
            id: user._id.toString(),
            email: user.email,
            username: user.username,
            role: user.role
        };

        next();
    } catch (error) {
        logger.error('Authentication error:', { message: error.message });
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token',
                error: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired',
                error: 'Token expired'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Authentication failed',
            error: error.message
        });
    }
};

// ตรวจสอบว่า user มี role ที่อนุญาตหรือไม่
exports.authorize = (...roles) => {
    return (req, res, next) => {
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

// บังคับให้ request ต้องมี session ที่ถูกต้อง ใช้กับ route ที่ต้องการ session tracking
exports.requireSession = (req, res, next) => {
    if (!req.authSession || !req.authSession.sessionId) {
        logger.warn('Session required but not found for user:', req.user?.id);
        return res.status(401).json({
            success: false,
            message: 'Session required',
            error: 'Current session not found'
        });
    }

    next();
};