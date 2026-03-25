const authService = require('../services/auth.service');
const logger      = require('../../../shared/utils/logger');
const { passport, GOOGLE_ENABLED } = require('../../../shared/config/passport');
const emailVerificationService = require('../../../shared/services/emailVerification.service');
const securityAuditService = require('../../../shared/services/securityAudit.service');
const User = require('../../../shared/models/User');
const bcrypt = require('bcryptjs');
const Session = require('../../../shared/models/Session');
const SecurityAudit = require('../../../shared/models/SecurityAudit');

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
        const { email, password } = req.body;
        const result = await authService.login({ email, password, req });

        logger.info(`User logged in: ${email}`);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data:    result
        });
    } catch (error) {
        logger.error('Login error:', error.message);

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
        
        // Format response (แปลง ipAddress → ip สำหรับ frontend)
        const formattedLogs = logs.map(log => ({
            _id: log._id,
            action: log.action,
            status: log.status,
            ip: log.ipAddress, 
            userAgent: log.userAgent,
            details: log.metadata?.reason || '',
            createdAt: log.createdAt
        }));
        
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

// ─── Verify 2FA (for login) ───────────────────────────────────────────────────
exports.verify2FA = async (req, res, next) => {
    try {
        const { tempToken, twoFactorToken, backupCode } = req.body;
        
        if (!tempToken) {
            return res.status(400).json({
                success: false,
                error: 'Temp token is required'
            });
        }
        
        const result = await authService.verify2FAAndLogin({
            tempToken,
            twoFactorToken,
            backupCode,
            req
        });
        
        logger.info('2FA verified and login successful');
        
        res.json({
            success: true,
            message: 'Login successful',
            data: result
        });
    } catch (error) {
        logger.error('Verify 2FA error:', error);
        
        if (error.message.includes('Invalid 2FA token') || 
            error.message.includes('Invalid temp token')) {
            return res.status(401).json({
                success: false,
                error: 'Invalid 2FA verification'
            });
        }
        
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
    try {
        req.logout((err) => {
            if (err) return next(err);
            if (req.session) req.session.destroy();
            res.json({ success: true, message: 'Logged out successfully' });
        });
    } catch (error) {
        next(error);
    }
};

// ✅ แก้ไขฟังก์ชัน deleteAccount
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { password } = req.body;

        console.log('🗑️ Delete account request for user:', userId);

        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'Password is required for account deletion'
            });
        }

        const user = await User.findById(userId).select('+password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log('User found:', user.email);

        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            console.log('❌ Invalid password for account deletion');
            return res.status(401).json({
                success: false,
                error: 'Invalid password'
            });
        }

        // ลบ sessions ทั้งหมด
        await Session.deleteMany({ userId });
        console.log('✅ Deleted all sessions');

        // ✅ บันทึก audit log ก่อนลบ - ใช้ SecurityAudit.logEvent()
        await SecurityAudit.logEvent({
            userId,
            action: 'account_deactivated', // ใช้ enum ที่มีอยู่แล้ว
            status: 'success',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            metadata: {
                email: user.email,
                reason: 'Account permanently deleted by user',
                eventType: 'permanent_deletion'
            }
        });

        // ลบ user
        await User.findByIdAndDelete(userId);
        console.log('✅ User account deleted:', user.email);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete account error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete account',
            details: error.message
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
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Current password and new password are required'
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

        const user = await User.findById(userId).select('-password');

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
                twoFactorEnabled: user.twoFactorEnabled || false,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
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

