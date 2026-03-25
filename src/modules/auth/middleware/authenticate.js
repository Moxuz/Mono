// src/modules/auth/middleware/authenticate.js

const jwt = require('jsonwebtoken');
const config = require('../../../shared/config/config');
const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const logger = require('../../../shared/utils/logger');

/**
 * Middleware to authenticate JWT token
 */
exports.authenticate = async (req, res, next) => {
    try {
        let token = req.headers['authorization'] || req.query.token;
        
        if (!token) {
            console.log('No token provided');
            return res.status(403).json({
                success: false,
                message: 'No token provided'
            });
        }

        if (token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        console.log('Token received:', token.substring(0, 20) + '...');

        const decoded = jwt.verify(token, config.JWT_SECRET);
        console.log('Token decoded:', decoded);

        const userId = decoded.id || decoded.sub;
        
        if (!userId) {
            console.log('No user ID in token');
            return res.status(401).json({
                success: false,
                message: 'Invalid token format'
            });
        }

        console.log('Looking for user:', userId);

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

        // ============================================
        // 🆕 SESSION TRACKING (เปลี่ยนชื่อ)
        // ============================================
        
        const session = await Session.findOne({
            sessionToken: token,
            isActive: true
        });
        
        if (session) {
            console.log('Session found:', session._id);
            
            if (session.isExpired()) {
                console.log('Session expired:', session._id);
                await session.revoke('expired');
                return res.status(401).json({
                    success: false,
                    message: 'Session expired',
                    error: 'Session expired'
                });
            }
            
            try {
                await session.updateLastActive();
                console.log('Session activity updated:', session._id);
            } catch (error) {
                logger.error('Failed to update session activity:', error);
            }
            
            // 🔧 เปลี่ยนจาก req.session → req.authSession
            req.authSession = {
                sessionId: session._id.toString(),
                sessionToken: token
            };
            
            console.log('Auth session attached:', req.authSession.sessionId);
        } else {
            console.log('No session found for token (might be OAuth or old token)');
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
        console.error('Authentication error:', error.message);
        
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

/**
 * 🆕 Middleware to require session
 */
exports.requireSession = (req, res, next) => {
    // 🔧 เปลี่ยนจาก req.session → req.authSession
    if (!req.authSession || !req.authSession.sessionId) {
        logger.warn('Session required but not found for user:', req.user?.id);
        return res.status(400).json({
            success: false,
            message: 'Session required',
            error: 'Current session not found'
        });
    }
    
    console.log('Session validation passed:', req.authSession.sessionId);
    next();
};