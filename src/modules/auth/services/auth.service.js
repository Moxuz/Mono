const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Pre-computed dummy hash for timing-safe user lookup — prevents timing attacks
// when user is not found (bcrypt.compare takes ~100ms; skipping it leaks user existence)
const TIMING_DUMMY_HASH = bcrypt.hashSync('timing_normalization_placeholder', 12);
const User = require('../../../shared/models/User');
const config = require('../../../shared/config/config');
const emailService = require('../../../shared/services/email.service');
const crypto = require('crypto');
const { validatePassword } = require('../../../shared/utils/passwordValidator');
const securityAuditService = require('../../../shared/services/securityAudit.service');
const sessionService = require('../../../shared/services/session.service');
const logger = require('../../../shared/utils/logger');

class AuthService {
    // สมัครสมาชิกใหม่ ตรวจสอบรหัสผ่าน ส่งอีเมลยืนยัน และสร้าง JWT
    async register({ username, email, password, pdpaConsent, req }) {
        try {
            logger.info(`Register attempt for user: ${email}`);

            // Validate password strength
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                logger.warn(`Weak password detected for user: ${email}`, { errors: passwordValidation.errors });
                const error = new Error('Password does not meet requirements');
                error.code = 'WEAK_PASSWORD';
                error.details = passwordValidation.errors;
                throw error;
            }

            // Check if username already taken
            const existingUsername = await User.findOne({ username });
            if (existingUsername) {
                logger.warn(`Registration failed - username already taken: ${username}`);
                await securityAuditService.logSecurityEvent({
                    userId: null,
                    action: 'registration_failed',
                    status: 'failure',
                    ipAddress: pdpaConsent?.consentIp,
                    metadata: { reason: 'username_already_exists', username, email }
                });
                throw new Error('Username already taken');
            }

            // Check if user exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                logger.warn(`Registration failed - user already exists: ${email}`);
                await securityAuditService.logSecurityEvent({
                    userId: null,
                    action: 'registration_failed',
                    status: 'failure',
                    ipAddress: pdpaConsent?.consentIp,
                    metadata: { reason: 'email_already_exists', email }
                });
                throw new Error('User already exists');
            }

            // Create new user
            const user = new User({
                username,
                email,
                password,
                pdpaConsent: pdpaConsent || {}
            });

            await user.save();
            logger.info(`User created successfully: ${user.email} (ID: ${user._id})`);

            // Log security event first — audit must succeed before firing email
            securityAuditService.logSecurityEvent({
                userId: user._id,
                action: 'account_created',
                status: 'success',
                ipAddress: pdpaConsent?.consentIp,
                metadata: {
                    email: user.email,
                    username: user.username
                }
            });

            // Send welcome email (async, non-blocking)
            emailService
                .sendWelcomeEmail({ to: user.email, username: user.username })
                .catch((err) => logger.error('Welcome email failed:', { email: user.email, error: err.message }));

            // Generate tokens — rollback user creation if this fails
            let token, refreshToken;
            try {
                token = this.createToken(user);
                refreshToken = this.generateRefreshToken(user);
            } catch (tokenErr) {
                logger.error(`JWT generation failed for new user ${user.email} — rolling back`, tokenErr.message);
                await User.deleteOne({ _id: user._id });
                throw new Error('Registration failed: could not generate access token');
            }
            logger.info(`Tokens generated for new user: ${user.email}`);

            // Create session (consistent with login flow)
            let session = null;
            try {
                session = await sessionService.createSession(user._id, token, refreshToken, req);
                logger.info(`Session created for new user: ${user.email}`);
            } catch (err) {
                logger.error('Failed to create session after registration:', err.message);
            }

            return {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                token,
                refreshToken,
                sessionId: session?.sessionId || null
            };
        } catch (error) {
            logger.error('Registration failed:', { error: error.message, email });
            throw error;
        }
    }

    // อัปเดตสถานะการยินยอม cookie ของ user
    async updateCookieConsent(userId, { cookieConsentAccepted, cookieConsentAt, consentIp, version }) {
        try {
            logger.info(`Updating cookie consent for user ID: ${userId}`);

            const user = await User.findById(userId);
            if (!user) {
                logger.warn(`Cookie consent update failed - user not found: ${userId}`);
                throw new Error('User not found');
            }

            user.pdpaConsent.cookieConsentAccepted = cookieConsentAccepted;
            user.pdpaConsent.cookieConsentAt       = cookieConsentAt;
            user.pdpaConsent.consentIp             = consentIp;
            user.pdpaConsent.policyVersion         = version || user.pdpaConsent.policyVersion;

            await user.save();
            logger.info(`Cookie consent updated for user: ${user.email}`);

            return { success: true };
        } catch (error) {
            logger.error('Cookie consent update failed:', { userId, error: error.message });
            throw error;
        }
    }

    // ตรวจสอบข้อมูลเข้าสู่ระบบ สร้าง JWT และ session พร้อมส่ง login alert
    async login({ email, password, remember, req }) {
        try {
            if (typeof email !== 'string' || typeof password !== 'string') {
                throw new Error('Invalid credentials');
            }

            logger.info(`Login attempt for user: ${email}`);

            // Find user
            const user = await User.findOne({ email }).select('+password');
            if (!user) {
                logger.warn(`Login failed - user not found: ${email}`);
                await securityAuditService.logLoginFailed(email, req, 'user_not_found');
                await bcrypt.compare(password, TIMING_DUMMY_HASH); // prevent timing attack
                throw new Error('Invalid credentials');
            }

            // Check if account is active
            if (!user.isActive) {
                logger.warn(`Login failed - account inactive: ${email}`);
                await securityAuditService.logLoginFailed(email, req, 'account_inactive');
                throw new Error('Account is inactive. Please contact support.');
            }

            // Check if account is locked
            if (user.isLocked()) {
                const retryAfterSec = Math.ceil((user.lockUntil - new Date()) / 1000);
                const lockTime = Math.ceil(retryAfterSec / 60);
                logger.warn(`Login failed - account locked: ${email} (${lockTime} minutes remaining)`);
                await securityAuditService.logLoginFailed(email, req, 'account_locked');
                const lockErr = new Error(`Account is locked. Try again in ${lockTime} minutes`);
                lockErr.retryAfter = retryAfterSec;
                throw lockErr;
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                const isNowLocked = await user.incrementLoginAttempts();

                if (isNowLocked) {
                    logger.warn(`Login failed - account locked due to too many attempts: ${email}`);
                    await securityAuditService.logAccountLocked(user, req, 'too_many_failed_attempts');
                    const lockErr = new Error('Account is locked due to too many failed attempts. Try again in 15 minutes');
                    lockErr.retryAfter = 15 * 60;
                    throw lockErr;
                }

                logger.warn(`Login failed - invalid password for user: ${email}`);
                await securityAuditService.logLoginFailed(email, req, 'invalid_password');
                throw new Error('Invalid credentials');
            }

            // Reset login attempts on successful login
            await user.resetLoginAttempts();

            // Update last login
            user.lastLogin = new Date();
            await user.save();
            logger.info(`Password verified for user: ${email}`);

            // Log successful login — audit first, then fire email
            await securityAuditService.logLoginSuccess(user, req);

            // ส่ง Login Alert Email (async - ไม่ block login process)
            sendLoginAlertIfEnabled(user, req).catch(err => {
                logger.error('Login alert email failed:', { email: user.email, error: err.message });
            });
            logger.info(`Login successful for user: ${email}`);

            // Generate token
            const token = this.createToken(user, remember);
            const refreshToken = this.generateRefreshToken(user);

            // Create session
            let session = null;
            try {
                session = await sessionService.createSession(
                    user._id,
                    token,
                    refreshToken,
                    req
                );
                logger.info(`Session created for user: ${email} (Session ID: ${session.sessionId})`);
            } catch (error) {
                logger.error('Failed to create session:', { email, error: error.message });
            }

            return {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                token,
                refreshToken,
                sessionId: session?.sessionId || null
            };
        } catch (error) {
            logger.error('Login failed:', { error: error.message, email });
            throw error;
        }
    }

    // สร้าง JWT access token โดยกำหนดอายุตามตัวเลือก remember me
    createToken(user, remember = false) {
        const expiresIn = remember ? '30d' : (config.JWT_EXPIRE || '1h');
        return jwt.sign(
            {
                sub: user._id.toString(),
                email: user.email,
                role: user.role,
                provider: user.googleId ? 'google' : user.githubId ? 'github' : 'local',
                jti: crypto.randomBytes(16).toString('hex')
            },
            config.JWT_SECRET,
            { expiresIn }
        );
    }

    // สร้าง JWT refresh token อายุ 30 วัน
    generateRefreshToken(user) {
        return jwt.sign(
            {
                sub: user._id.toString(),
                type: 'refresh_token',
                jti: crypto.randomBytes(16).toString('hex')
            },
            config.JWT_SECRET,
            { expiresIn: '30d' }
        );
    }

    // ตรวจสอบความถูกต้องและอายุของ JWT token
    async validateToken(token) {
        try {
            logger.info(`Token validation requested`);

            if (!token) {
                logger.warn('Token validation failed - no token provided');
                return {
                    valid: false,
                    error: 'Token is required'
                };
            }

            const decoded = jwt.verify(token, config.JWT_SECRET);

            const now = Math.floor(Date.now() / 1000);
            if (decoded.exp && decoded.exp < now) {
                logger.warn('Token validation failed - token expired');
                return {
                    valid: false,
                    error: 'Token has expired'
                };
            }

            logger.info(`Token validation successful for user: ${decoded.email || decoded.id}`);

            return {
                valid: true,
                payload: decoded
            };

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                logger.warn('Token validation failed - expired');
                return {
                    valid: false,
                    error: 'Token has expired'
                };
            }

            if (error.name === 'JsonWebTokenError') {
                logger.warn('Token validation failed - invalid format');
                return {
                    valid: false,
                    error: 'Invalid token format'
                };
            }

            logger.error('Token validation failed:', error.message);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    // ต่ออายุ access token โดยใช้ refresh token พร้อม rotate token เก่า
    async refreshToken(refreshToken, sessionId = null, deviceInfo = null) {
        try {
            logger.info('Refresh token request received');

            const decoded = jwt.verify(refreshToken, config.JWT_SECRET);
            
            if (decoded.type !== 'refresh_token') {
                logger.warn('Refresh token failed - invalid token type');
                await securityAuditService.logSecurityEvent({
                    userId: decoded.sub || decoded.id,
                    action: 'token_refresh_failed',
                    status: 'failure',
                    metadata: { reason: 'wrong_token_type', jti: decoded.jti }
                });
                throw new Error('Invalid refresh token');
            }

            const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
            const isBlacklisted = await TokenBlacklist.isBlacklisted(refreshToken);
            if (isBlacklisted) {
                logger.warn('Refresh token failed - token is blacklisted (possible reuse attack)');
                const breachUserId = decoded.sub || decoded.id;
                await securityAuditService.logSecurityEvent({
                    userId: breachUserId,
                    action: 'security_breach',
                    status: 'failure',
                    metadata: { reason: 'token_reuse_detected', jti: decoded.jti }
                });
                await this.blacklistAllUserTokens(breachUserId, 'security_breach');
                // Notify user of breach (best-effort, non-blocking)
                User.findById(breachUserId).select('email username').then(breachUser => {
                    if (breachUser) {
                        emailService.sendEmail({
                            to: breachUser.email,
                            subject: 'Security Alert: Unusual Activity Detected on Your Account',
                            text: `Dear ${breachUser.username},\n\nWe detected suspicious activity on your account — a refresh token was reused, which may indicate theft. All active sessions have been terminated.\n\nIf this was not you, please contact support immediately and change your password.\n\nAuthSys Security Team`
                        }).catch(err => logger.error('Breach notification email failed:', err.message));
                    }
                }).catch(() => {});
                throw new Error('Token has been revoked due to security concerns');
            }

            const user = await User.findById(decoded.sub || decoded.id);

            if (!user) {
                logger.warn('Refresh token failed - user not found');
                throw new Error('User not found');
            }

            if (!user.isActive) {
                logger.warn('Refresh token failed - user account is inactive');
                await TokenBlacklist.revokeToken(refreshToken, user._id, null, 'admin_revoke');
                throw new Error('User account is inactive');
            }

            if (sessionId) {
                const Session = require('../../../shared/models/Session');
                const session = await Session.findOne({ _id: sessionId, userId: user._id, isActive: true });

                if (!session) {
                    logger.warn('Refresh token failed - session not found or inactive');
                    await securityAuditService.logSecurityEvent({
                        userId: user._id,
                        action: 'token_refresh_failed',
                        status: 'failure',
                        metadata: { reason: 'session_revoked', sessionId }
                    });
                    await TokenBlacklist.revokeToken(refreshToken, user._id, null, 'user_logout');
                    throw new Error('Session has expired or been revoked');
                }

                const sessionUpdate = { lastActiveAt: new Date() };
                if (deviceInfo?.ipAddress) sessionUpdate.ipAddress = deviceInfo.ipAddress;
                await Session.updateOne({ _id: session._id }, { $set: sessionUpdate });
                logger.info(`Session activity updated for user: ${user.email}`);
            }

            const Session = require('../../../shared/models/Session');
            const oldRefreshHash = Session.hashRefreshToken(refreshToken);

            await TokenBlacklist.revokeToken(refreshToken, user._id, null, 'token_rotation');
            logger.info(`Old refresh token blacklisted for user: ${user.email} (rotation)`);

            const newAccessToken = this.createToken(user);
            const newRefreshToken = this.generateRefreshToken(user);

            // Update session with new tokens so req.authSession stays valid
            const updatedSession = await Session.findOneAndUpdate(
                { refreshTokenHash: oldRefreshHash, userId: user._id, isActive: true },
                {
                    accessTokenHash: Session.hashToken(newAccessToken),
                    refreshTokenHash: Session.hashToken(newRefreshToken),
                    lastActiveAt: new Date()
                }
            );
            if (!updatedSession) {
                logger.warn('Token rotation: no matching session found for hash update', { userId: user._id });
            }

            const securityAuditService = require('../../../shared/services/securityAudit.service');
            await securityAuditService.logSecurityEvent({
                userId: user._id,
                action: 'token_refreshed',
                status: 'success',
                ipAddress: deviceInfo?.ipAddress,
                metadata: {
                    sessionId,
                    device: deviceInfo?.deviceType
                }
            });

            logger.info(`Token rotation completed for user: ${user.email}`);

            return {
                token: newAccessToken,
                refreshToken: newRefreshToken,
                expiresIn: config.JWT_EXPIRE || '1h'
            };
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                logger.warn('Refresh token failed - token expired');
                throw new Error('Refresh token has expired. Please login again.');
            }
            
            if (error.name === 'JsonWebTokenError') {
                logger.warn('Refresh token failed - invalid token format');
                throw new Error('Invalid refresh token format');
            }

            logger.error('Refresh token failed:', error.message);
            throw error;
        }
    }

    // เพิกถอน session และ refresh token ทั้งหมดของ user
    async blacklistAllUserTokens(userId, reason = 'security_breach') {
        try {
            const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
            const Session = require('../../../shared/models/Session');

            const sessions = await Session.find({ userId, isActive: true });

            for (const session of sessions) {
                if (session.accessTokenHash) {
                    await TokenBlacklist.revokeByHash(session.accessTokenHash, userId, null, reason);
                }
                if (session.refreshTokenHash) {
                    await TokenBlacklist.revokeByHash(session.refreshTokenHash, userId, null, reason);
                }

                await Session.updateOne({ _id: session._id }, { $set: { isActive: false, revokedAt: new Date(), revokeReason: 'security_breach' } });
            }

            logger.warn(`All tokens blacklisted for user ${userId} - Reason: ${reason}`);
            
            return { success: true, count: sessions.length };
        } catch (error) {
            logger.error('Blacklist all tokens failed:', error.message);
            throw error;
        }
    }

    // ดึงรายการ session ที่ active ทั้งหมดของ user
    async getActiveSessions(userId) {
        try {
            const Session = require('../../../shared/models/Session');
            
            const sessions = await Session.find(
                { userId, isActive: true },
                { deviceInfo: 1, lastActiveAt: 1, createdAt: 1 }
            ).sort({ lastActiveAt: -1 });

            logger.info(`Retrieved ${sessions.length} active sessions for user ${userId}`);

            return sessions;
        } catch (error) {
            logger.error('Get active sessions failed:', error.message);
            throw error;
        }
    }

    // ยกเลิก session ที่ระบุและ blacklist refresh token ที่เกี่ยวข้อง
    async revokeSession(userId, sessionId) {
        try {
            const Session = require('../../../shared/models/Session');
            const TokenBlacklist = require('../../../shared/models/TokenBlacklist');

            const session = await Session.findOne({ _id: sessionId, userId, isActive: true });

            if (!session) {
                throw new Error('Session not found');
            }

            if (session.accessTokenHash) {
                await TokenBlacklist.revokeByHash(session.accessTokenHash, userId, null, 'user_logout');
            }
            if (session.refreshTokenHash) {
                await TokenBlacklist.revokeByHash(session.refreshTokenHash, userId, null, 'user_logout');
            }

            await Session.updateOne({ _id: session._id }, { $set: { isActive: false, revokedAt: new Date(), revokeReason: 'user_logout' } });

            logger.info(`Session ${sessionId} revoked for user ${userId}`);

            return { success: true };
        } catch (error) {
            logger.error('Revoke session failed:', error.message);
            throw error;
        }
    }

    // ยกเลิก session ทั้งหมดยกเว้น session ปัจจุบัน
    async revokeAllOtherSessions(userId, currentSessionId) {
        try {
            const Session = require('../../../shared/models/Session');
            const TokenBlacklist = require('../../../shared/models/TokenBlacklist');

            const sessions = await Session.find({
                userId,
                isActive: true,
                _id: { $ne: currentSessionId }
            });

            for (const session of sessions) {
                if (session.accessTokenHash) {
                    await TokenBlacklist.revokeByHash(session.accessTokenHash, userId, null, 'user_logout');
                }
                if (session.refreshTokenHash) {
                    await TokenBlacklist.revokeByHash(session.refreshTokenHash, userId, null, 'user_logout');
                }

                await Session.updateOne({ _id: session._id }, { $set: { isActive: false, revokedAt: new Date(), revokeReason: 'user_logout' } });
            }

            logger.info(`Revoked ${sessions.length} other sessions for user ${userId}`);

            return { success: true, count: sessions.length };
        } catch (error) {
            logger.error('Revoke all other sessions failed:', error.message);
            throw error;
        }
    }

    // ตรวจสอบว่า session เกินจำนวนที่กำหนดหรือไม่ ถ้าเกินให้ลบ session เก่าสุด
    async checkSessionLimit(userId, maxSessions = 5) {
        try {
            const Session = require('../../../shared/models/Session');
            
            const activeSessionCount = await Session.countDocuments({
                userId,
                isActive: true
            });

            if (activeSessionCount >= maxSessions) {
                logger.warn(`Session limit reached for user ${userId} (${activeSessionCount}/${maxSessions})`);
                
                const oldestSession = await Session.findOne(
                    { userId, isActive: true },
                    null,
                    { sort: { lastActiveAt: 1 } }
                );

                if (oldestSession) {
                    await this.revokeSession(userId, oldestSession._id);
                    logger.info(`Revoked oldest session for user ${userId} to maintain limit`);
                }

                return { limitReached: true, action: 'revoked_oldest' };
            }

            return { limitReached: false, activeSessions: activeSessionCount };
        } catch (error) {
            logger.error('Check session limit failed:', error.message);
            throw error;
        }
    }

    // สร้าง reset token และส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลที่ระบุ
    async forgotPassword(email, req = null) {
        try {
            logger.info(`Password reset requested for: ${email}`);

            const user = await User.findOne({ email })
                .select('+passwordResetToken +passwordResetExpires');

            if (!user) {
                logger.info(`Password reset - email not found (not revealing): ${email}`);
                return { message: 'If this email exists, a reset link has been sent.' };
            }

            const resetToken  = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

            user.passwordResetToken   = hashedToken;
            user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
            await user.save();

            logger.info(`Password reset token created for: ${user.email}`);

            const resetUrl = `${process.env.AUTH_SERVER_URL}/reset-password.html?token=${resetToken}`;

            try {
                await emailService.sendPasswordResetEmail({
                    to:       user.email,
                    username: user.username,
                    resetUrl,
                });
                logger.info(`Password reset email sent to: ${user.email}`);
            } catch (emailError) {
                logger.error('Password reset email failed:', { email: user.email, error: emailError.message });
                user.passwordResetToken   = undefined;
                user.passwordResetExpires = undefined;
                await user.save();
                throw new Error('Failed to send reset email. Please try again.');
            }

            return { message: 'If this email exists, a reset link has been sent.' };
        } catch (error) {
            logger.error('Forgot password failed:', { email, error: error.message });
            throw error;
        }
    }

    // ตรวจสอบ reset token และเปลี่ยนรหัสผ่านเป็นรหัสใหม่
    async resetPassword(token, newPassword, req = null) {
        try {
            logger.info('Password reset with token attempted');

            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

            const user = await User.findOne({
                passwordResetToken:   hashedToken,
                passwordResetExpires: { $gt: Date.now() },
            }).select('+password +passwordResetToken +passwordResetExpires');

            if (!user) {
                logger.warn('Password reset failed - invalid or expired token');
                throw new Error('Invalid or expired reset token');
            }

            const isSamePassword = await bcrypt.compare(newPassword, user.password);
            if (isSamePassword) {
                logger.warn(`Password reset failed - new password same as current: ${user.email}`);
                throw new Error('New password must be different from your current password');
            }

            user.password             = newPassword;
            user.passwordResetToken   = undefined;
            user.passwordResetExpires = undefined;
            await user.save();

            // Revoke all active sessions so stolen tokens can't be reused after reset
            await this.blacklistAllUserTokens(user._id, 'password_change').catch(err =>
                logger.error('Failed to revoke sessions after password reset:', err.message)
            );

            logger.info(`Password reset successful for user: ${user.email}`);

            await securityAuditService.logSecurityEvent({
                userId: user._id,
                action: 'password_reset_completed',
                status: 'success',
                ipAddress: req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0] || req?.connection?.remoteAddress || 'unknown',
                userAgent: req?.headers?.['user-agent'] || 'unknown',
                metadata: {
                    email: user.email,
                    method: 'reset_token',
                    tokenUsed: true
                }
            });

            emailService
                .sendPasswordChangedEmail({ to: user.email, username: user.username })
                .catch((err) => logger.error('Password changed email failed:', { email: user.email, error: err.message }));

            return { message: 'Password reset successful' };
        } catch (error) {
            logger.error('Password reset failed:', error.message);
            throw error;
        }
    }

    // บันทึกการตั้งค่า theme, ภาษา และการแจ้งเตือนของ user
    async updatePreferences(userId, preferences) {
        try {
            logger.info(`Updating preferences for user: ${userId}`);

            const user = await User.findById(userId);
            if (!user) {
                logger.warn(`Preferences update failed - user not found: ${userId}`);
                throw new Error('User not found');
            }

            if (preferences.theme) {
                user.preferences.theme = preferences.theme;
            }
            if (preferences.language) {
                user.preferences.language = preferences.language;
            }
            if (preferences.notifications) {
                if (typeof preferences.notifications.email === 'boolean') {
                    user.preferences.notifications.email = preferences.notifications.email;
                }
                if (typeof preferences.notifications.loginAlerts === 'boolean') {
                    user.preferences.notifications.loginAlerts = preferences.notifications.loginAlerts;
                }
            }

            await user.save();
            logger.info(`Preferences updated for user: ${user.email}`);

            return {
                preferences: user.preferences
            };
        } catch (error) {
            logger.error('Update preferences failed:', { userId, error: error.message });
            throw error;
        }
    }

    // ดึงการตั้งค่าของ user หรือค่า default ถ้ายังไม่มี
    async getPreferences(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            return {
                preferences: user.preferences || {
                    theme: 'dark',
                    language: 'en',
                    notifications: {
                        email: true,
                        loginAlerts: true
                    }
                }
            };
        } catch (error) {
            logger.error('Get preferences failed:', { userId, error: error.message });
            throw error;
        }
    }

    // เปลี่ยนรหัสผ่าน โดยตรวจสอบรหัสเดิมก่อน (ยกเว้น OAuth user)
    async changePassword(userId, currentPassword, newPassword, req) {
        try {
            logger.info(`Password change requested for user ID: ${userId}`);

            const passwordValidation = validatePassword(newPassword);
            if (!passwordValidation.valid) {
                logger.warn(`Weak new password for user ID: ${userId}`, { errors: passwordValidation.errors });
                const error = new Error('New password does not meet requirements');
                error.code = 'WEAK_PASSWORD';
                error.details = passwordValidation.errors;
                throw error;
            }

            const user = await User.findById(userId).select('+password');
            if (!user) {
                logger.warn(`Password change failed - user not found: ${userId}`);
                throw new Error('User not found');
            }

            if (user.password) {
                if (!currentPassword) {
                    throw new Error('Current password is required');
                }
                const isMatch = await bcrypt.compare(currentPassword, user.password);
                if (!isMatch) {
                    logger.warn(`Password change failed - current password incorrect: ${user.email}`);
                    throw new Error('Current password is incorrect');
                }
                if (await bcrypt.compare(newPassword, user.password)) {
                    logger.warn(`Password change failed - new password same as current: ${user.email}`);
                    throw new Error('New password must be different from current password');
                }
            } else {
                logger.info(`OAuth user setting initial password: ${user.email}`);
            }

            user.password = newPassword;
            await user.save();
            logger.info(`Password updated for user: ${user.email}`);

            emailService
                .sendPasswordChangedEmail({ to: user.email, username: user.username })
                .catch((err) => logger.error('Password changed email failed:', { email: user.email, error: err.message }));

            await securityAuditService.logPasswordChanged(user, req);

            logger.info(`Password change completed for user: ${user.email}`);

            return { message: 'Password changed successfully' };
        } catch (error) {
            logger.error('Password change failed:', { userId, error: error.message });
            throw error;
        }
    }
}

// ส่งอีเมลแจ้งเตือนการ login ถ้า user ไม่ได้ปิดการแจ้งเตือน
async function sendLoginAlertIfEnabled(user, req) {
    try {
        // Only skip if the preference is explicitly set to false.
        // If preferences/notifications are missing, default to sending the alert.
        if (user.preferences?.notifications?.email === false) {
            logger.info(`Login alert skipped - email notifications disabled by user: ${user.email}`);
            return;
        }
        if (user.preferences?.notifications?.loginAlerts === false) {
            logger.info(`Login alert skipped - login alerts disabled by user: ${user.email}`);
            return;
        }

        const userAgent = req.headers['user-agent'] || 'Unknown';
        const ipAddress = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress;

        const deviceInfo = {
            deviceType: getDeviceType(userAgent),
            browser: getBrowser(userAgent),
            os: getOS(userAgent),
            location: ipAddress
        };

        await emailService.sendLoginAlertEmail({
            to: user.email,
            username: user.username,
            deviceInfo,
            ipAddress,
            timestamp: new Date()
        });

        logger.info(`Login alert email sent to: ${user.email}`);
    } catch (error) {
        logger.error('Send login alert failed:', error);
        throw error;
    }
}

// ระบุประเภทอุปกรณ์จาก user agent string
function getDeviceType(userAgent) {
    if (/mobile/i.test(userAgent)) return 'Mobile';
    if (/tablet/i.test(userAgent)) return 'Tablet';
    return 'Desktop';
}

// ระบุชื่อ browser จาก user agent string
function getBrowser(userAgent) {
    if (/edg/i.test(userAgent)) return 'Edge';
    if (/chrome/i.test(userAgent)) return 'Chrome';
    if (/firefox/i.test(userAgent)) return 'Firefox';
    if (/safari/i.test(userAgent)) return 'Safari';
    if (/opera/i.test(userAgent)) return 'Opera';
    return 'Unknown';
}

// ระบุชื่อระบบปฏิบัติการจาก user agent string
function getOS(userAgent) {
    if (/windows/i.test(userAgent)) return 'Windows';
    if (/mac/i.test(userAgent)) return 'macOS';
    if (/linux/i.test(userAgent)) return 'Linux';
    if (/android/i.test(userAgent)) return 'Android';
    if (/ios/i.test(userAgent)) return 'iOS';
    return 'Unknown';
}

module.exports = new AuthService();
module.exports.sendLoginAlertIfEnabled = sendLoginAlertIfEnabled;