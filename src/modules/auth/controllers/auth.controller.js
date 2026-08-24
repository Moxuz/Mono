const authService = require('../services/auth.service');
const logger      = require('../../../shared/utils/logger');
const { passport, GOOGLE_ENABLED } = require('../../../shared/config/passport');
const securityAuditService = require('../../../shared/services/securityAudit.service');
const userService = require('../../user/services/user.service');
const User = require('../../../shared/models/User');
const bcrypt = require('bcryptjs');
const Session = require('../../../shared/models/Session');
const SecurityAudit = require('../../../shared/models/SecurityAudit');
const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
const jwt = require('jsonwebtoken');
const config = require('../../../shared/config/config');
const { recordLoginAttempt, recordActiveUser } = require('../../dashboard/services/realtimeMetrics.service');
const { establishWebSession, destroyWebSession } = require('../../../shared/services/webSession.service');
const { parsePagination } = require('../../../shared/utils/pagination');
const { sanitizeAuditMetadata } = require('../../../shared/utils/auditIdentity');

function safeWebAuthResponse(result, remember = false) {
    return {
        authenticated: true,
        remembered: Boolean(remember),
        user: result?.user || null
    };
}

// ─── Register ─────────────────────────────────────────────────────────────────
// รับข้อมูลสมัครสมาชิก ตรวจสอบ consent และเรียก authService.register
exports.register = async (req, res, next) => {
    try {
        const {
            username,
            email,
            password,
            consentEssential,
            consentAnalytics
        } = req.body;

        if (!consentEssential) {
            securityAuditService.logSecurityEvent({
                userId: null,
                action: 'registration_failed',
                status: 'failure',
                ipAddress: req.ip,
                metadata: { reason: 'consent_not_granted', email: req.body?.email }
            }).catch(() => {});
            return res.status(400).json({
                success: false,
                error:   'Essential consent required',
                message: 'Please accept the essential consent before registering.'
            });
        }

        const consentIp = req.ip ||
                          req.headers['x-forwarded-for']?.split(',')[0] ||
                          req.connection?.remoteAddress;

        const now = new Date();

        const result = await authService.register({
            username,
            email,
            password,
            req,
            pdpaConsent: {
                essentialAccepted:   true,
                essentialAcceptedAt: now,
                analyticsAccepted:   !!consentAnalytics,
                analyticsAcceptedAt: consentAnalytics ? now : null,
                policyVersion:       '1.1.0',
                consentIp
            }
        });

        await establishWebSession(req, result.user, result.sessionId);

        logger.info(`User registered: ${email} | analytics: ${!!consentAnalytics} | IP: ${consentIp}`);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data:    safeWebAuthResponse(result)
        });

    } catch (error) {
        logger.error('Registration error:', error);
        if (error.message === 'Username already taken') {
            return res.status(409).json({ success: false, error: 'Username already taken' });
        }
        if (error.message === 'User already exists' || error.code === 11000) {
            return res.status(409).json({ success: false, error: 'User already exists' });
        }
        if (error.code === 'WEAK_PASSWORD') {
            securityAuditService.logSecurityEvent({
                userId: null,
                action: 'registration_failed',
                status: 'failure',
                ipAddress: req.ip,
                metadata: { reason: 'weak_password', email: req.body?.email }
            }).catch(() => {});
            return res.status(400).json({
                success: false,
                error: 'WEAK_PASSWORD',
                message: 'Password does not meet requirements',
                details: error.details
            });
        }
        next(error);
    }
};

// ─── Login ────────────────────────────────────────────────────────────────────
// รับ email/password และส่งต่อให้ authService.login จัดการ
exports.login = async (req, res, next) => {
    try {
        const { email, password, remember } = req.body;
        const result = await authService.login({ email, password, remember, req });
        const apiTokenResponse = req.apiTokenResponse === true;
        if (!apiTokenResponse) {
            await establishWebSession(req, result.user, result.sessionId, [], { remember: Boolean(remember) });
        }
        recordLoginAttempt(true, req.ip, result.user?.id);
        recordActiveUser(result.user?.id);

        const loginIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress;
        logger.info(`User logged in: ${email}`, { 
            ip: loginIp,
            userAgent: req.headers['user-agent'],
            userId: result.user?.id
        });

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data:    apiTokenResponse ? result : safeWebAuthResponse(result, remember)
        });
    } catch (error) {
        recordLoginAttempt(false, req.ip);
        const loginIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress;
        const emailLog = typeof req.body.email === 'string' ? req.body.email : '[invalid]';
        logger.error(`Login failed for: ${emailLog}`, {
            error: error.message,
            ip: loginIp,
            userAgent: req.headers['user-agent']
        });

        if (error.message === 'Invalid credentials' ||
            error.message === 'User not found') {
            return res.status(401).json({
                success: false,
                error:   'Invalid credentials',
                message: 'Email or password is incorrect'
            });
        }
        if (error.message.includes('Account is inactive')) {
            return res.status(401).json({
                success: false,
                error:   'Account inactive',
                message: 'Your account has been deactivated'
            });
        }
        if (error.message.includes('Account is locked')) {
            const retryAfter = error.retryAfter || 900;
            res.set('Retry-After', retryAfter);
            return res.status(423).json({
                success: false,
                error:   'Account locked',
                message: error.message,
                retryAfter
            });
        }

        res.status(500).json({
            success: false,
            error:   'Login failed',
            message: 'An error occurred during login'
        });
    }
};

// Explicit compatibility endpoint for non-browser API tooling. First-party
// web pages must use POST /api/auth/login and receive only the HttpOnly session
// response. OAuth clients should prefer the authorization-code token endpoint.
exports.loginToken = async (req, res, next) => {
    req.apiTokenResponse = true;
    return exports.login(req, res, next);
};

// Return first-party browser session state without exposing a bearer token.
exports.getWebSession = (req, res) => {
    const user = req.session?.user;
    if (!user) return res.json({ authenticated: false, user: null });
    res.json({
        authenticated: true,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            provider: user.provider || 'local'
        }
    });
};

// บันทึกการตั้งค่า theme, ภาษา และการแจ้งเตือนของ user
exports.updatePreferences = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { theme, language, notifications } = req.body;

    const result = await authService.updatePreferences(userId, {
      theme,
      language,
      notifications
    });

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Update preferences error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ─── Get Preferences ──────────────────────────────────────────────────────────
// ดึงการตั้งค่าของ user ที่ล็อกอินอยู่
exports.getPreferences = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const result = await authService.getPreferences(userId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Get preferences error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};



// ดึง audit log 50 รายการล่าสุดของ user และจัดรูปแบบข้อมูล
exports.getSecurityAudit = async (req, res) => {
    try {
        const userId = req.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }
        
        // Get last 50 audit logs for this user
        const logs = await securityAuditService.getUserAuditLogs(userId, 50);
        
        // Format response — build a human-readable details string from metadata
        const formattedLogs = logs.map(log => {
            const meta = sanitizeAuditMetadata(log.metadata || {});
            let details = '';
            if (meta.reason)       details = meta.reason;
            else if (meta.method)  details = `via ${meta.method}`;
            else if (meta.emailHash) details = `identity ${String(meta.emailHash).slice(0, 12)}`;
            else if (meta.action)  details = meta.action;
            else if (meta.sessionId) details = `session ${String(meta.sessionId).slice(0, 8)}`;

            return {
                _id: log._id,
                action: log.action,
                status: log.status,
                ip: log.ipAddress,
                userAgent: log.userAgent,
                details,
                metadata: meta,
                createdAt: log.createdAt
            };
        });
        
        res.json({
            success: true,
            data: formattedLogs,
            count: formattedLogs.length
        });
    } catch (error) {
        logger.error('Get security audit error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve security audit logs'
        });
    }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const email = req.user?.email;

        const authHeader = req.headers['authorization'];
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
            const SessionModel = require('../../../shared/models/Session');

            // Extract client_id from token if present (OAuth tokens carry it; regular login tokens do not)
            let tokenClientId = null;
            try {
                const decoded = jwt.decode(token);
                tokenClientId = decoded?.client_id || null;
            } catch (_) { /* ignore decode errors */ }

            // Blacklist current access token
            await TokenBlacklist.revokeToken(token, userId, tokenClientId, 'user_logout');

            // Find active session — blacklist refresh token hash + deactivate
            const accessTokenHash = SessionModel.hashToken(token);
            const session = await SessionModel.findOne({
                accessTokenHash,
                userId,
                isActive: true
            });

            if (session) {
                if (session.refreshTokenHash) {
                    await TokenBlacklist.revokeByHash(session.refreshTokenHash, userId, tokenClientId, 'user_logout')
                        .catch(err => logger.warn('Failed to blacklist refresh token hash on logout:', err.message));
                }
                session.isActive = false;
                session.revokedAt = new Date();
                session.revokeReason = 'user_logout';
                await session.save();
            }
        }

        if (!authHeader?.startsWith('Bearer ') && req.session?.user?.sessionId) {
            await authService.revokeSession(userId, req.session.user.sessionId)
                .catch(err => logger.warn('Failed to revoke cookie session:', err.message));
        }

        await new Promise((resolve, reject) => req.logout((err) => err ? reject(err) : resolve()));
        await destroyWebSession(req);
        res.clearCookie('connect.sid');

        logger.info(`User logged out: ${email || userId}`, {
            userId,
            ip: req.ip || req.connection?.remoteAddress
        });

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        logger.error('Logout error:', error);
        next(error);
    }
};

// ตรวจสอบรหัสผ่านหรือ reauth token ก่อนลบบัญชี (soft delete + anonymize ตาม PDPA)
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const email = req.user.email;
        const { password } = req.body;
        const reauth_token = req.cookies?.reauth_token || req.body?.reauth_token;

        const clientIp = req.ip || req.socket?.remoteAddress;

        logger.security(`Account deletion attempt for: ${email}`, { function: 'deleteAccount', userId, ip: clientIp });

        const user = await User.findById(userId).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (user.password) {
            if (!password) {
                return res.status(400).json({
                    success: false,
                    error: 'Password is required for account deletion'
                });
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                logger.warn('deleteAccount: invalid password supplied', { function: 'deleteAccount', userId });
                return res.status(401).json({
                    success: false,
                    error: 'Invalid password'
                });
            }
        } else {
            // OAuth user — require a short-lived reauth token from the provider
            if (!reauth_token) {
                return res.status(401).json({
                    success: false,
                    error: 'Re-authentication required. Please verify your identity with your OAuth provider.'
                });
            }
            try {
                const payload = jwt.verify(reauth_token, config.JWT_SECRET);
                if (payload.purpose !== 'delete_account' || payload.userId !== userId.toString()) {
                    throw new Error('Invalid reauth token');
                }
            } catch (err) {
                return res.status(401).json({
                    success: false,
                    error: 'Re-authentication token is invalid or expired. Please verify again.'
                });
            }
            logger.info('deleteAccount: OAuth re-authentication verified', { function: 'deleteAccount', userId });
            res.clearCookie('reauth_token');
        }

        // Delegate to userService — soft delete: anonymize data, revoke sessions, audit log
        await userService.deleteUser(userId, 'user_request');

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        logger.error('deleteAccount failed', { function: 'deleteAccount', error: error.message, userId: req.user?._id || req.user?.id });
        res.status(500).json({
            success: false,
            error: 'Failed to delete account'
        });
    }
};

// ─── Validate Token ───────────────────────────────────────────────────────────
// รับ token จาก body และตรวจสอบความถูกต้อง
exports.validateToken = async (req, res, next) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ valid: false, error: 'Token is required' });
        }
        const result = await authService.validateToken(token);
        res.status(200).json(result);
    } catch (error) {
        logger.error('Validate token error:', error);
        res.status(401).json({ valid: false, error: error.message });
    }
};

// ─── Refresh Token ────────────────────────────────────────────────────────────
// รับ refresh token และออก access token ใหม่
exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const sessionId = req.body.sessionId || req.headers['x-session-id'];
        const deviceInfo = {
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0]
        };
        const result = await authService.refreshToken(refreshToken, sessionId, deviceInfo);
        res.json(result);
    } catch (error) {
        logger.error('Refresh token error:', { error: error.message });
        res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }
};


// ─── Cookie Consent ───────────────────────────────────────────────────────────
// บันทึกหรืออัปเดตการยินยอม cookie ของ user ที่ล็อกอินอยู่
exports.updateCookieConsent = async (req, res, next) => {
    try {
        const { cookieConsentAccepted, analyticsAccepted, version } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        if (typeof cookieConsentAccepted !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'cookieConsentAccepted must be boolean'
            });
        }
        if (analyticsAccepted !== undefined && typeof analyticsAccepted !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'analyticsAccepted must be boolean'
            });
        }
        if (version !== undefined && (typeof version !== 'string' || version.length > 32)) {
            return res.status(400).json({
                success: false,
                error: 'version must be a short string'
            });
        }

        const consentIp = req.ip ||
                          req.headers['x-forwarded-for']?.split(',')[0] ||
                          req.connection?.remoteAddress;

        await authService.updateCookieConsent(userId, {
            cookieConsentAccepted,
            analyticsAccepted,
            cookieConsentAt: new Date(),
            version,
            consentIp
        });

        logger.info(`Cookie consent: user=${userId} accepted=${cookieConsentAccepted}`);
        res.json({ success: true, message: 'Cookie consent updated' });

    } catch (error) {
        logger.error('Cookie consent error:', error);
        next(error);
    }
};



// ─── Forgot Password ──────────────────────────────────────────────────────────
// ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมล ไม่เปิดเผยว่า email มีในระบบหรือไม่
exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        await authService.forgotPassword(email, req);
        res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    } catch (error) {
        // Keep the response enumeration-safe, but do not hide operational
        // failures from logs/monitoring.
        logger.error('Forgot password processing failed:', {
            error: error.message,
            email: typeof req.body?.email === 'string' ? req.body.email : '[invalid]'
        });
        res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
// รับ token จาก URL parameter และรหัสผ่านใหม่เพื่อรีเซ็ต
exports.resetPassword = async (req, res, next) => {
    try {
        const { token }    = req.params;
        const { password } = req.body;
         await authService.resetPassword(token, password, req); 

        res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
  
    if (error.message === 'New password must be different from your current password') {
      return res.status(400).json({ 
        success: false, 
        error: 'SAME_PASSWORD',
        message: error.message 
      });
    }
    res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────
// เปลี่ยนรหัสผ่านขณะล็อกอิน ต้องผ่านการตรวจสอบรหัสเดิมก่อน
exports.changePassword = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }
        
        const { currentPassword, newPassword } = req.body;
        
        if (!newPassword) {
            return res.status(400).json({
                success: false,
                error: 'New password is required'
            });
        }
        
        const result = await authService.changePassword(userId, currentPassword, newPassword, req);
        
        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        logger.error('Change password error:', error);
        
        if (error.code === 'WEAK_PASSWORD') {
            return res.status(400).json({
                success: false,
                error: 'WEAK_PASSWORD',
                message: 'New password does not meet requirements',
                details: error.details
            });
        }
        
        if (error.message === 'Current password is incorrect') {
            return res.status(401).json({
                success: false,
                error: 'Invalid current password'
            });
        }
        
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// ─── Set Password ────────────────────────────────────────────────────────────
// บัญชีที่เริ่มจาก Google/GitHub ยังไม่มี local password จึงตั้ง password ได้
// หลังผ่านการ authenticate ด้วย social provider แล้วเท่านั้น
exports.setPassword = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const { newPassword } = req.body;
        const result = await authService.setPassword(userId, newPassword, req);

        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        logger.error('Set password error:', error);

        if (error.code === 'WEAK_PASSWORD') {
            return res.status(400).json({
                success: false,
                error: 'WEAK_PASSWORD',
                message: 'New password does not meet requirements',
                details: error.details
            });
        }

        if (error.code === 'PASSWORD_ALREADY_SET') {
            return res.status(409).json({
                success: false,
                error: error.code,
                message: 'Password is already set. Use change password instead.'
            });
        }

        res.status(400).json({
            success: false,
            error: error.message || 'Failed to set password'
        });
    }
};

// ─── Get Audit Logs ───────────────────────────────────────────────────────────
// ดึง audit log แบบ paginate สำหรับ user ที่ล็อกอินอยู่
exports.getAuditLogs = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const pagination = parsePagination(req.query.page, req.query.limit, 20, 100);
        const page = pagination.page;
        const limit = pagination.limit;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const result = await securityAuditService.getUserAuditLogs(userId, page, limit);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Get audit logs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get audit logs'
        });
    }
};

// ─── Get Active Sessions ──────────────────────────────────────────────────────
// ดึงรายการ session ที่ active ทั้งหมดของ user
exports.getActiveSessions = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const sessions = await authService.getActiveSessions(userId);

        logger.info(`Active sessions retrieved for user ${userId}`);

        res.json({
            success: true,
            data: {
                sessions,
                count: sessions.length
            }
        });
    } catch (error) {
        logger.error('Get active sessions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get active sessions'
        });
    }
};

// ─── Revoke Session ───────────────────────────────────────────────────────────
// ยกเลิก session ที่ระบุ ID
exports.revokeSession = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const { sessionId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID is required'
            });
        }

        await authService.revokeSession(userId, sessionId);

        logger.info(`Session ${sessionId} revoked for user ${userId}`);

        res.json({
            success: true,
            message: 'Session revoked successfully'
        });
    } catch (error) {
        logger.error('Revoke session error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// ─── Revoke All Other Sessions ────────────────────────────────────────────────
// ยกเลิก session ทุกอันยกเว้น session ปัจจุบัน (logout จากอุปกรณ์อื่น)
exports.revokeAllOtherSessions = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const currentSessionId = req.body.currentSessionId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        if (!currentSessionId) {
            return res.status(400).json({
                success: false,
                error: 'Current session ID is required'
            });
        }

        const result = await authService.revokeAllOtherSessions(userId, currentSessionId);

        logger.info(`All other sessions revoked for user ${userId}`);

        res.json({
            success: true,
            message: `Revoked ${result.count} other session(s) successfully`,
            data: result
        });
    } catch (error) {
        logger.error('Revoke all other sessions error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};


// ดึงข้อมูลโปรไฟล์พื้นฐานของ user ที่ล็อกอินอยู่
exports.getProfile = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const user = await User.findById(userId).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                provider: user.googleId ? 'google' : user.githubId ? 'github' : 'local',
                displayName: user.displayName || '',
                bio: user.bio || '',
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                hasPassword: !!user.password
            }
        });
    } catch (error) {
        logger.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get profile'
        });
    }
};

// ─── Emergency Lockdown (Blacklist All Tokens) ────────────────────────────────
// ยกเลิก session และ token ทั้งหมดของ user ทันทีในกรณีฉุกเฉิน
exports.emergencyLockdown = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const result = await authService.blacklistAllUserTokens(userId, 'security_breach');

        logger.warn(`Emergency lockdown activated for user ${userId}`);

        res.json({
            success: true,
            message: 'All sessions have been terminated for security',
            data: result
        });
    } catch (error) {
        logger.error('Emergency lockdown error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};
