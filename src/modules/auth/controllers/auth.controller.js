const authService = require('../services/auth.service');
const logger = require('../../../shared/utils/logger');

// ต้องมี exports ทุก function ที่ใช้ใน routes
exports.register = async (req, res, next) => {
    try {
        const { username, email, password } = req.body;
        
        const result = await authService.register({ username, email, password });
        
        logger.info(`User registered: ${email}`);
        
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: result
        });
    } catch (error) {
        logger.error('Registration error:', error);
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        
        const result = await authService.login({ email, password });
        
        logger.info(`User logged in: ${email}`);
        
        res.json({
            success: true,
            message: 'Login successful',
            data: result
        });
    } catch (error) {
        logger.error('Login error:', error);
        next(error);
    }
};

exports.logout = async (req, res, next) => {
    try {
        req.logout((err) => {
            if (err) return next(err);
            if (req.session) {
                req.session.destroy();
            }
            res.json({ success: true, message: 'Logged out successfully' });
        });
    } catch (error) {
        next(error);
    }
};

exports.validateToken = async (req, res, next) => {
    try {
        const { token } = req.body;
        const result = await authService.validateToken(token);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const result = await authService.refreshToken(refreshToken);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

exports.googleAuth = (req, res, next) => {
    // This will be handled by passport middleware
    res.redirect('/auth/google');
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
        next(error);
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
        next(error);
    }
};