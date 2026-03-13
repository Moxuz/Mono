const authService = require('../services/auth.service');
const logger = require('../../../shared/utils/logger');

exports.register = async (req, res, next) => {
    try {
        const {
            username,
            email,
            password,
            consentEssential,   // ✅ เปลี่ยนจาก privacyPolicy
            consentAnalytics    // ✅ เพิ่มใหม่
        } = req.body;

        // ── Validate essential consent ────────────────────────
        if (!consentEssential) {
            return res.status(400).json({
                success: false,
                error: 'Essential consent required',
                message: 'กรุณายินยอมการใช้ข้อมูลที่จำเป็นก่อนสมัครสมาชิก'
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
            data: result
        });

    } catch (error) {
        logger.error('Registration error:', error);

        if (error.message === 'User already exists') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        next(error);
    }
};
// ─── Cookie Consent API ───────────────────────────────────────
exports.updateCookieConsent = async (req, res, next) => {
    try {
        const { cookieConsentAccepted, version } = req.body;
        const userId = req.user?.id || req.user?._id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
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

        logger.info(`Cookie consent updated: user=${userId} accepted=${cookieConsentAccepted}`);

        res.json({
            success: true,
            message: 'Cookie consent updated'
        });
    } catch (error) {
        logger.error('Cookie consent error:', error);
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        
        console.log('Login attempt for:', email);
        
        const result = await authService.login({ email, password });
        
        logger.info(`User logged in: ${email}`);
        
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: result
        });
    } catch (error) {
        logger.error('Login error:', error.message);
        
        // ⭐ Handle specific errors with correct status codes
        if (error.message === 'Invalid credentials') {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                message: 'Email or password is incorrect'
            });
        }
        
        if (error.message === 'User not found') {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                message: 'Email or password is incorrect'
            });
        }
        
        if (error.message === 'Account is inactive') {
            return res.status(403).json({
                success: false,
                error: 'Account inactive',
                message: 'Your account has been deactivated'
            });
        }
        
        // ⭐ Generic error (don't expose details)
        res.status(500).json({
            success: false,
            error: 'Login failed',
            message: 'An error occurred during login'
        });
    }
};

exports.logout = async (req, res, next) => {
    try {
        req.logout((err) => {
            if (err) return next(err);
            if (req.session) {
                req.session.destroy();
            }
            res.json({ 
                success: true, 
                message: 'Logged out successfully' 
            });
        });
    } catch (error) {
        next(error);
    }
};

exports.validateToken = async (req, res, next) => {
    try {
        const { token } = req.body;
        
        //  เช็คว่ามี token หรือไม่
        if (!token) {
            return res.status(400).json({
                valid: false,
                error: 'Token is required'
            });
        }
        
        const result = await authService.validateToken(token);
        
        //  ถ้า valid ส่ง 200, ถ้าไม่ valid ส่ง 401
        if (result.valid) {
            res.status(200).json(result);
        } else {
            res.status(401).json(result);
        }
        
    } catch (error) {
        logger.error('Validate token error:', error);
        res.status(401).json({ 
            valid: false, 
            error: error.message 
        });
    }
};
exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const result = await authService.refreshToken(refreshToken);
        res.json(result);
    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'Invalid refresh token'
        });
    }
};

exports.googleAuth = (req, res, next) => {
    // Handled by passport
};

exports.googleCallback = async (req, res, next) => {
    try {
        const token = await authService.createToken(req.user);
        const redirectUri = req.query.redirectUri || '/dashboard';
        res.redirect(`${redirectUri}?token=${token}`);
    } catch (error) {
        next(error);
    }
};

exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        await authService.forgotPassword(email);
        res.json({
            success: true,
            message: 'Password reset email sent'
        });
    } catch (error) {
        // ⭐ Don't reveal if user exists
        res.json({
            success: true,
            message: 'If that email exists, a reset link has been sent'
        });
    }
};

exports.resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        await authService.resetPassword(token, password);
        res.json({
            success: true,
            message: 'Password reset successful'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: 'Invalid or expired reset token'
        });
    }
};