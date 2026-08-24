const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Pre-computed dummy hash for timing-safe user lookup — prevents timing attacks
// when user is not found (bcrypt.compare takes ~100ms; skipping it leaks user existence)
const TIMING_DUMMY_HASH = bcrypt.hashSync('timing_normalization_placeholder', 10);
const User = require('../../../shared/models/User');
const config = require('../../../shared/config/config');
const emailService = require('../../../shared/services/email.service');
const crypto = require('crypto');
const { validatePassword } = require('../../../shared/utils/passwordValidator');
const securityAuditService = require('../../../shared/services/securityAudit.service');
const sessionService = require('../../../shared/services/session.service');
const logger = require('../../../shared/utils/logger');
const Session = require('../../../shared/models/Session');
const TokenBlacklist = require('../../../shared/models/TokenBlacklist');

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

            // Registration is session-bound. If persistence fails, roll the
            // new account back instead of returning credentials that cannot be
            // revoked or used by the first-party browser flow.
            let session;
            try {
                session = await sessionService.createSession(user._id, token, refreshToken, req);
                logger.info(`Session created for new user: ${user.email}`);
            } catch (err) {
                logger.error('Failed to create session after registration:', err.message);
                await User.deleteOne({ _id: user._id });
                throw new Error('Registration failed: could not create session');
            }

            await securityAuditService.logSecurityEvent({
                userId: user._id,
                action: 'account_created',
                status: 'success',
                ipAddress: pdpaConsent?.consentIp,
                metadata: {
                    email: user.email,
                    username: user.username
                }
            });

            // Send only after both the account and revocable session exist.
            emailService
                .sendWelcomeEmail({ to: user.email, username: user.username })
                .catch((err) => logger.error('Welcome email failed:', { email: user.email, error: err.message }));

            return {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                token,
                refreshToken,
                sessionId: session.sessionId
            };
        } catch (error) {
            logger.error('Registration failed:', { error: error.message, email });
            throw error;
        }
    }

    // อัปเดตสถานะการยินยอม cookie ของ user
    async updateCookieConsent(userId, { cookieConsentAccepted, analyticsAccepted, cookieConsentAt, consentIp, version }) {
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

            if (typeof analyticsAccepted === 'boolean') {
                user.pdpaConsent.analyticsAccepted = analyticsAccepted;
                user.pdpaConsent.analyticsAcceptedAt = analyticsAccepted ? cookieConsentAt : null;
            }

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

            // A social-only account has no local password. Run the same costly
            // comparison and return the same public error as a bad password so
            // this path cannot be used for account/provider enumeration.
            if (!user.password) {
                await bcrypt.compare(password, TIMING_DUMMY_HASH);
                await securityAuditService.logLoginFailed(email, req, 'invalid_password');
                throw new Error('Invalid credentials');
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                // Do not reveal inactive/locked state to someone who does not
                // know the password. Also avoid extending an existing lock.
                if (!user.isActive || user.isLocked()) {
                    await securityAuditService.logLoginFailed(email, req, 'invalid_password');
                    throw new Error('Invalid credentials');
                }

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

            // Account state is disclosed only after the credential itself has
            // been proved, preventing username/account-state enumeration.
            if (!user.isActive) {
                logger.warn(`Login failed - account inactive: ${email}`);
                await securityAuditService.logLoginFailed(email, req, 'account_inactive');
                throw new Error('Account is inactive. Please contact support.');
            }

            if (user.isLocked()) {
                const retryAfterSec = Math.ceil((user.lockUntil - new Date()) / 1000);
                const lockTime = Math.ceil(retryAfterSec / 60);
                logger.warn(`Login failed - account locked: ${email} (${lockTime} minutes remaining)`);
                await securityAuditService.logLoginFailed(email, req, 'account_locked');
                const lockErr = new Error(`Account is locked. Try again in ${lockTime} minutes`);
                lockErr.retryAfter = retryAfterSec;
                throw lockErr;
            }

            // Reset login attempts on successful login
            await user.resetLoginAttempts();

            // Update last login
            user.lastLogin = new Date();
            await user.save();
            logger.info(`Password verified for user: ${email}`);

            // Generate token
            const token = this.createToken(user, remember);
            const refreshToken = this.generateRefreshToken(user);

            // Authentication is session-bound. Never return a bearer token if
            // its revocation/session record could not be persisted.
            let session;
            try {
                session = await sessionService.createSession(
                    user._id,
                    token,
                    refreshToken,
                    req,
                    remember
                );
                logger.info(`Session created for user: ${email} (Session ID: ${session.sessionId})`);
            } catch (error) {
                logger.error('Failed to create session:', { email, error: error.message });
                throw new Error('Authentication session could not be created');
            }

            await securityAuditService.logLoginSuccess(user, req);
            sendLoginAlertIfEnabled(user, req).catch(err => {
                logger.error('Login alert email failed:', { email: user.email, error: err.message });
            });
            logger.info(`Login successful for user: ${email}`);

            return {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                token,
                refreshToken,
                sessionId: session.sessionId
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
                type: 'access_token',
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
            logger.info('Token validation requested');

            if (!token) {
                logger.warn('Token validation failed - no token provided');
                return {
                    valid: false,
                    error: 'Token is required'
                };
            }

            const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
            if (decoded.type !== 'access_token') {
                return { valid: false, error: 'Invalid access token' };
            }

            if (await TokenBlacklist.isBlacklisted(token)) {
                return { valid: false, error: 'Token has been revoked' };
            }

            const userId = decoded.sub || decoded.id;
            if (!userId) return { valid: false, error: 'Invalid access token' };

            const [user, session] = await Promise.all([
                User.findById(userId).select('_id isActive'),
                Session.findOne({
                    userId,
                    accessTokenHash: Session.hashToken(token),
                    isActive: true
                })
            ]);
            if (!user?.isActive || !session) {
                return { valid: false, error: 'Token session is inactive' };
            }
            if (session.isExpired()) {
                await session.revoke('expired');
                return { valid: false, error: 'Token has expired' };
            }

            logger.info('Token validation successful', { userId });

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
                error: 'Token validation failed'
            };
        }
    }

    // ต่ออายุ access token โดยใช้ refresh token พร้อม rotate token เก่า
    async refreshToken(refreshToken, sessionId = null, deviceInfo = null) {
        try {
            logger.info('Refresh token request received');

            const decoded = jwt.verify(refreshToken, config.JWT_SECRET, { algorithms: ['HS256'] });
            
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

            const breachUserId = decoded.sub || decoded.id;
            const handleReuse = async (reason) => {
                logger.warn('Refresh token reuse detected', { userId: breachUserId, reason });
                await securityAuditService.logSecurityEvent({
                    userId: breachUserId,
                    action: 'security_breach',
                    status: 'failure',
                    metadata: { reason: 'token_reuse_detected', detail: reason, jti: decoded.jti }
                });
                await this.blacklistAllUserTokens(breachUserId, 'security_breach');
                User.findById(breachUserId).select('email username').then(breachUser => {
                    if (!breachUser) return;
                    return emailService.sendEmail({
                        to: breachUser.email,
                        subject: 'Security Alert: Unusual Activity Detected on Your Account',
                        text: `Dear ${breachUser.username},\n\nWe detected suspicious refresh-token reuse. All active sessions have been terminated.\n\nIf this was not you, change your password and contact the administrator.\n\nAuthSys Security Team`
                    });
                }).catch(err => logger.error('Breach notification email failed:', err.message));
            };

            const isBlacklisted = await TokenBlacklist.isBlacklisted(refreshToken);
            if (isBlacklisted) {
                await handleReuse('blacklisted_token');
                throw new Error('Token has been revoked due to security concerns');
            }

            const user = await User.findById(breachUserId);

            if (!user) {
                logger.warn('Refresh token failed - user not found');
                throw new Error('User not found');
            }

            if (!user.isActive) {
                logger.warn('Refresh token failed - user account is inactive');
                await TokenBlacklist.revokeToken(refreshToken, user._id, null, 'admin_revoke');
                throw new Error('User account is inactive');
            }

            const oldRefreshHash = Session.hashRefreshToken(refreshToken);
            const newAccessToken = this.createToken(user);
            const newRefreshToken = this.generateRefreshToken(user);

            const sessionQuery = {
                refreshTokenHash: oldRefreshHash,
                userId: user._id,
                isActive: true,
                expiresAt: { $gt: new Date() }
            };
            if (sessionId) sessionQuery._id = sessionId;

            // The old refresh-token hash is part of the update predicate. Only
            // one concurrent request can win this rotation.
            const updatedSession = await Session.findOneAndUpdate(
                sessionQuery,
                { $set: {
                    accessTokenHash: Session.hashToken(newAccessToken),
                    refreshTokenHash: Session.hashToken(newRefreshToken),
                    lastActiveAt: new Date(),
                    ...(deviceInfo?.ipAddress ? { ipAddress: deviceInfo.ipAddress } : {})
                } },
                { new: true }
            );
            if (!updatedSession) {
                await TokenBlacklist.revokeToken(refreshToken, user._id, null, 'token_rotation').catch(() => {});
                await handleReuse('session_hash_mismatch');
                throw new Error('Session has expired or been revoked');
            }

            await TokenBlacklist.revokeToken(refreshToken, user._id, null, 'token_rotation');
            logger.info(`Old refresh token blacklisted for user: ${user.email} (rotation)`);

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
            const tokenReason = reason === 'password_change' ? 'password_changed' : reason;
            const sessionReason = reason === 'password_changed' ? 'password_change' : reason;

            for (const session of sessions) {
                if (session.accessTokenHash) {
                    await TokenBlacklist.revokeByHash(session.accessTokenHash, userId, null, tokenReason);
                }
                if (session.refreshTokenHash) {
                    await TokenBlacklist.revokeByHash(session.refreshTokenHash, userId, null, tokenReason);
                }

                await Session.updateOne({ _id: session._id }, { $set: { isActive: false, revokedAt: new Date(), revokeReason: sessionReason } });
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
    async checkSessionLimit(userId, maxSessions = config.MAX_ACTIVE_SESSIONS) {
        try {
            return await sessionService.enforceSessionLimit(userId, maxSessions);
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
                .select('+password +passwordResetToken +passwordResetExpires');

            if (!user) {
                logger.info(`Password reset - email not found (not revealing): ${email}`);
                return { message: 'If this email exists, a reset link has been sent.' };
            }

            // Social-only accounts do not have a local password to reset.
            // They must authenticate with Google/GitHub and use Set password.
            if (!user.password) {
                logger.info(`Password reset skipped - social-only account: ${user.email}`);
                return { message: 'If this email exists, a reset link has been sent.' };
            }

            const resetToken  = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

            user.passwordResetToken   = hashedToken;
            user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
            await user.save();

            logger.info(`Password reset token created for: ${user.email}`);

            const resetUrl = `${config.AUTH_SERVER_URL}/reset-password.html?token=${resetToken}`;

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

            // Tokens created for social-only accounts by older builds are not
            // usable as local password resets.
            if (!user.password) {
                user.passwordResetToken = undefined;
                user.passwordResetExpires = undefined;
                await user.save();
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

            if (preferences.theme !== undefined && !['dark', 'light', 'auto'].includes(preferences.theme)) {
                throw new Error('Invalid theme preference');
            }
            if (preferences.language !== undefined && !['en', 'th'].includes(preferences.language)) {
                throw new Error('Invalid language preference');
            }
            if (preferences.notifications !== undefined &&
                (typeof preferences.notifications !== 'object' || preferences.notifications === null || Array.isArray(preferences.notifications))) {
                throw new Error('Invalid notification preferences');
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

    // ตั้ง local password ครั้งแรกสำหรับบัญชีที่ authenticate ผ่าน OAuth
    async setPassword(userId, newPassword, req) {
        const user = await User.findById(userId).select('+password');
        if (!user) {
            throw new Error('User not found');
        }

        if (user.password) {
            const error = new Error('Password is already set');
            error.code = 'PASSWORD_ALREADY_SET';
            throw error;
        }

        return this.changePassword(userId, null, newPassword, req);
    }

    // เปลี่ยนรหัสผ่าน โดยตรวจสอบรหัสเดิมก่อน
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
            // Password changes invalidate every OAuth/web session credential.
            await this.blacklistAllUserTokens(userId, 'password_change');
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
