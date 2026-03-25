const twoFAService = require('../../../shared/services/2fa.service');
const logger = require('../../../shared/utils/logger');

/**
 * Generate 2FA secret
 */
exports.generateSecret = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }
        
        const result = await twoFAService.generate2FASecret(userId);
        
        res.json({
            success: true,
            message: '2FA secret generated. Scan QR code and verify to enable.',
            data: {
                secret: result.secret,
                otpauth_url: result.otpauth_url,
                qrCodeUrl: result.qrCodeUrl
            }
        });
    } catch (error) {
        logger.error('Generate 2FA secret error:', error);
        
        if (error.message === '2FA is already enabled for this user') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to generate 2FA secret'
        });
    }
};

/**
 * Verify 2FA token and enable 2FA
 */
exports.verifyAndEnable = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const { token } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }
        
        if (!token || token.length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'Invalid 2FA token. Must be 6 digits.'
            });
        }
        
        const result = await twoFAService.verifyAndEnable2FA(userId, token);
        
        res.json({
            success: true,
            message: '2FA enabled successfully. Save your backup codes!',
            data: {
                backupCodes: result.backupCodes
            }
        });
    } catch (error) {
        logger.error('Verify 2FA error:', error);
        
        if (error.message.includes('Invalid 2FA token')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to verify 2FA token'
        });
    }
};

/**
 * Disable 2FA
 */
exports.disable = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const { token } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }
        
        if (!token || token.length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'Invalid 2FA token. Must be 6 digits.'
            });
        }
        
        const result = await twoFAService.disable2FA(userId, token);
        
        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        logger.error('Disable 2FA error:', error);
        
        if (error.message === '2FA is not enabled') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        if (error.message.includes('Invalid 2FA token')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to disable 2FA'
        });
    }
};

/**
 * Verify 2FA token (for login flow)
 */
exports.verifyToken = async (req, res, next) => {
    try {
        const { token, backupCode } = req.body;
        const user = req.tempUser; // User from login, stored temporarily
        
        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'No pending authentication'
            });
        }
        
        let verified = false;
        
        // Try backup code first
        if (backupCode) {
            verified = await twoFAService.verifyBackupCode(user, backupCode);
        } else if (token) {
            verified = await twoFAService.verify2FAToken(user, token);
        }
        
        if (!verified) {
            return res.status(400).json({
                success: false,
                error: 'Invalid 2FA token or backup code'
            });
        }
        
        // 2FA verified, proceed with login
        // This will be handled by the login controller
        req.twoFactorVerified = true;
        
        res.json({
            success: true,
            message: '2FA verified successfully'
        });
    } catch (error) {
        logger.error('Verify 2FA token error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify 2FA token'
        });
    }
};

/**
 * Get 2FA status
 */
exports.getStatus = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }
        
        const result = await twoFAService.get2FAStatus(userId);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Get 2FA status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get 2FA status'
        });
    }
};

/**
 * Regenerate backup codes
 */
exports.regenerateBackupCodes = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const { token } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }
        
        if (!token || token.length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'Invalid 2FA token. Must be 6 digits.'
            });
        }
        
        const result = await twoFAService.regenerateBackupCodes(userId, token);
        
        res.json({
            success: true,
            message: result.message,
            data: {
                codes: result.codes
            }
        });
    } catch (error) {
        logger.error('Regenerate backup codes error:', error);
        
        if (error.message === '2FA is not enabled') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        if (error.message.includes('Invalid 2FA token')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to regenerate backup codes'
        });
    }
};
