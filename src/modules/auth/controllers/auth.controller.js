const authService = require('../services/auth.service');
const logger      = require('../../../shared/utils/logger');
const { passport, GOOGLE_ENABLED } = require('../../../shared/config/passport');
const emailVerificationService = require('../../../shared/services/emailVerification.service');
const securityAuditService = require('../../../shared/services/securityAudit.service');
const User = require('../../../shared/models/User');
const bcrypt = require('bcryptjs');
const Session = require('../../../shared/models/Session');
const SecurityAudit = require('../../../shared/models/SecurityAudit');
const jwt = require('jsonwebtoken');
const config = require('../../../shared/config/config');

// ─── Register ─────────────────────────────────────────────────────────────────
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
            pdpaConsent: {
                essentialAccepted:   true,
                essentialAcceptedAt: now,
                analyticsAccepted:   !!consentAnalytics,
                analyticsAcceptedAt: consentAnalytics ? now : null,
                policyVersion:       '1.0.0',
                consentIp
            }
        });

        logger.info(`User registered: ${email} | analytics: ${!!consentAnalytics} | IP: ${consentIp}`);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data:    result
        });

    } catch (error) {
        logger.error('Registration error:', error);
        if (error.message === 'User already exists') {
            return res.status(400).json({ success: false, error: error.message });
        }
        if (error.code === 'WEAK_PASSWORD') {
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
exports.login = async (req, res, next) => {
    try {
        const { email, password, remember } = req.body;
        const result = await authService.login({ email, password, remember, req });

        const loginIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress;
        logger.info(`User logged in: ${email}`, { 
            ip: loginIp,
            userAgent: req.headers['user-agent'],
            userId: result.data?.user?.id || result.user?.id
        });

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data:    result
        });
    } catch (error) {
        const loginIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress;
        logger.error(`Login failed for: ${req.body.email}`, { 
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
        if (error.message === 'Account is inactive') {
            return res.status(403).json({
                success: false,
                error:   'Account inactive',
                message: 'Your account has been deactivated'
            });
        }
        if (error.message.includes('Account is locked')) {
            return res.status(423).json({
                success: false,
                error:   'Account locked',
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            error:   'Login failed',
            message: 'An error occurred during login'
        });
    }
};

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
            const meta = log.metadata || {};
            let details = '';
            if (meta.reason)       details = meta.reason;
            else if (meta.method)  details = `via ${meta.method}`;
            else if (meta.email)   details = meta.email;
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
        console.error('Get security audit error:', error);
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

        req.logout((err) => {
            if (err) return next(err);
            if (req.session) req.session.destroy();

            logger.info(`User logged out: ${email || userId}`, { 
                userId, 
                ip: req.ip || req.connection.remoteAddress 
            });

            res.json({ success: true, message: 'Logged out successfully' });
        });
    } catch (error) {
        logger.error('Logout error:', error);
        next(error);
    }
};

// ✅ แก้ไขฟังก์ชัน deleteAccount
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const email = req.user.email;
        const { password, reauth_token } = req.body;

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
        }

        // Revoke all sessions
        await Session.deleteMany({ userId });
        logger.info('deleteAccount: all sessions removed', { function: 'deleteAccount', userId });

        // Audit log before deletion (userId reference will be orphaned after delete)
        await SecurityAudit.logEvent({
            userId,
            action: 'account_deactivated',
            status: 'success',
            ipAddress: clientIp,
            userAgent: req.headers['user-agent'],
            metadata: {
                email: user.email,
                reason: 'Account permanently deleted by user',
                eventType: 'permanent_deletion'
            }
        });

        await User.findByIdAndDelete(userId);
        logger.security(`Account permanently deleted: ${user.email}`, { function: 'deleteAccount', userId });

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
exports.validateToken = async (req, res, next) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ valid: false, error: 'Token is required' });
        }
        const result = await authService.validateToken(token);
        res.status(result.valid ? 200 : 401).json(result);
    } catch (error) {
        logger.error('Validate token error:', error);
        res.status(401).json({ valid: false, error: error.message });
    }
};

// ─── Refresh Token ────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const result = await authService.refreshToken(refreshToken);
        res.json(result);
    } catch (error) {
        res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }
};


// ─── Cookie Consent ───────────────────────────────────────────────────────────
exports.updateCookieConsent = async (req, res, next) => {
    try {
        const { cookieConsentAccepted, version } = req.body;
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

        const consentIp = req.ip ||
                          req.headers['x-forwarded-for']?.split(',')[0] ||
                          req.connection?.remoteAddress;

        await authService.updateCookieConsent(userId, {
            cookieConsentAccepted,
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
exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        await authService.forgotPassword(email);
        res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    } catch (error) {
        res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
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

// ─── Verify Email ─────────────────────────────────────────────────────────────
exports.verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.query;
        const result = await emailVerificationService.verifyEmail(token);
        
        logger.info(`Email verified: ${result.user.email}`);
        
        // Redirect to success page
        res.redirect('/login.html?verified=true');
    } catch (error) {
        logger.error('Email verification error:', error);
        res.redirect('/login.html?error=verification_failed');
    }
};

// ─── Resend Verification Email ────────────────────────────────────────────────
exports.resendVerificationEmail = async (req, res, next) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }
        
        const result = await emailVerificationService.resendVerificationEmail(email);
        
        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        logger.error('Resend verification email error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resend verification email'
        });
    }
};

// ─── Change Password ──────────────────────────────────────────────────────────
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

// ─── Get Audit Logs ───────────────────────────────────────────────────────────
exports.getAuditLogs = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

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
                isEmailVerified: user.isEmailVerified,
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

// ─── OAuth Session Bridge ─────────────────────────────────────────────────────
// Validates JWT from localStorage, sets server session, then redirects to returnTo
exports.setOAuthSession = async (req, res) => {
    const { token, returnTo } = req.query;
    const safeReturn = returnTo || '/login.html';

    if (!token) return res.redirect(`/login.html?error=missing_token`);

    try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) return res.redirect('/login.html?error=invalid_token');

        req.session.user = {
            id:       user._id.toString(),
            email:    user.email,
            username: user.username,
            role:     user.role
        };

        await new Promise((resolve, reject) =>
            req.session.save(err => err ? reject(err) : resolve())
        );

        res.redirect(safeReturn);
    } catch (err) {
        logger.error('OAuth session bridge error:', err.message);
        res.redirect('/login.html?error=invalid_token');
    }
};

// ─── Emergency Lockdown (Blacklist All Tokens) ────────────────────────────────
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

