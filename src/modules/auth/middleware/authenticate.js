// src/modules/auth/middleware/authenticate.js

const jwt = require('jsonwebtoken');
const config = require('../../../shared/config/config');
const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
const logger = require('../../../shared/utils/logger');

function rejectAuthentication(req, res, payload) {
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    const isHtmlPage = req.method === 'GET' &&
        !path.startsWith('/api/') &&
        !path.startsWith('/.well-known/') &&
        req.accepts('html');
    if (isHtmlPage) {
        return res.redirect('/login.html?returnTo=' + encodeURIComponent(path || '/dashboard.html'));
    }
    return res.status(401).json(payload);
}

// ตรวจสอบ JWT token จาก Authorization header ค้นหา user และอัปเดต session
exports.authenticate = async (req, res, next) => {
    try {
        // Bearer tokens must use the Authorization header. Query-string tokens
        // leak through browser history, access logs and referrer headers.
        let token = req.headers['authorization'];

        // First-party browser pages use an HttpOnly express session. This path
        // deliberately runs only when no Authorization header is supplied;
        // an explicitly supplied invalid bearer token must never downgrade to
        // a cookie session.
        if (!token) {
            const sessionUser = req.session?.user;
            if (!sessionUser?.id) {
                return rejectAuthentication(req, res, {
                    success: false,
                    message: 'No token provided'
                });
            }

            const sessionAccount = await User.findById(sessionUser.id);
            if (!sessionAccount || !sessionAccount.isActive) {
                return rejectAuthentication(req, res, {
                    success: false,
                    message: 'User account is inactive or unavailable'
                });
            }

            if (!sessionUser.sessionId) {
                return rejectAuthentication(req, res, {
                    success: false,
                    message: 'Session expired or requires sign-in again'
                });
            }

            const browserSession = await Session.findOne({
                _id: sessionUser.sessionId,
                userId: sessionAccount._id,
                isActive: true
            });
            if (!browserSession) {
                return rejectAuthentication(req, res, {
                    success: false,
                    message: 'Session expired or revoked'
                });
            }
            if (browserSession.isExpired()) {
                await browserSession.revoke('expired');
                return rejectAuthentication(req, res, {
                    success: false,
                    message: 'Session expired'
                });
            }

            try {
                await browserSession.updateLastActive();
            } catch (error) {
                logger.warn('Failed to update browser session activity:', error.message);
            }

            req.authSession = {
                sessionId: browserSession._id.toString(),
                sessionToken: null,
                cookieSession: true
            };
            req.user = {
                id: sessionAccount._id.toString(),
                email: sessionAccount.email,
                username: sessionAccount.username,
                role: sessionAccount.role
            };
            return next();
        }

        if (token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        const isBlacklisted = await TokenBlacklist.isBlacklisted(token);
        if (isBlacklisted) {
            return rejectAuthentication(req, res, {
                success: false,
                message: 'Token has been revoked'
            });
        }

        const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });

        // Only access tokens may authenticate API requests.  Refresh tokens,
        // OIDC ID tokens and re-authentication tokens are separate credentials
        // and must never be accepted by the general API guard.
        if (decoded.type !== 'access_token') {
            return rejectAuthentication(req, res, {
                success: false,
                message: 'Invalid token type'
            });
        }

        const userId = decoded.id || decoded.sub;

        if (!userId) {
            return rejectAuthentication(req, res, {
                success: false,
                message: 'Invalid token format'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return rejectAuthentication(req, res, {
                success: false,
                message: 'User not found'
            });
        }

        if (!user.isActive) {
            return rejectAuthentication(req, res, {
                success: false,
                message: 'User account is inactive'
            });
        }

        const accessTokenHash = Session.hashToken(token);
        const session = await Session.findOne({
            accessTokenHash,
            userId: user._id,
            isActive: true
        });

        if (session) {
            if (session.isExpired()) {
                await session.revoke('expired');
                return rejectAuthentication(req, res, {
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
            // First-party API access is session-bound. Without this check a
            // revoked session's still-valid JWT could continue to authorize
            // requests until its natural expiry.
            return rejectAuthentication(req, res, {
                success: false,
                message: 'Session expired or revoked'
            });
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
            return rejectAuthentication(req, res, {
                success: false,
                message: 'Invalid token',
                error: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return rejectAuthentication(req, res, {
                success: false,
                message: 'Token expired',
                error: 'Token expired'
            });
        }

        return rejectAuthentication(req, res, {
            success: false,
            message: 'Authentication failed',
            error: 'Authentication failed'
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
