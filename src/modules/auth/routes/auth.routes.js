const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/authenticate');



const {
    loginLimiter,
    registerLimiter,
    forgotPasswordLimiter,
    tokenLimiter,
    refreshTokenLimiter,
    generalLimiter,
} = require('../../../shared/middleware/rateLimiter');
const { validate, rules } = require('../../../shared/middleware/validate');

// Local authentication
router.post('/register',       registerLimiter,       validate(rules.register),       authController.register);
router.post('/login',          loginLimiter,           validate(rules.login),           authController.login);
router.post('/login/token',    loginLimiter,           validate(rules.login),           authController.loginToken);
router.get('/session',         authController.getWebSession);
router.post('/logout',         generalLimiter, authenticate, authController.logout);
router.post('/refresh-token',  refreshTokenLimiter,       authController.refreshToken);
router.post('/validate-token',  generalLimiter,        authController.validateToken);
router.get('/audit-logs',      authenticate,           authController.getAuditLogs);

// Password reset

router.post('/forgot-password', forgotPasswordLimiter, validate(rules.forgotPassword), authController.forgotPassword);
router.post('/reset-password/:token', forgotPasswordLimiter, validate(rules.resetPassword), authController.resetPassword);
router.post('/change-password', authenticate, forgotPasswordLimiter, validate(rules.changePassword), authController.changePassword);
router.post('/set-password', authenticate, forgotPasswordLimiter, validate(rules.setPassword), authController.setPassword);

// Session Management (Protected)
router.get('/sessions',         authenticate, authController.getActiveSessions);
router.post('/sessions/revoke', authenticate, authController.revokeSession);
router.post('/sessions/revoke-all-others', authenticate, authController.revokeAllOtherSessions);
router.post('/emergency-lockdown', authenticate, generalLimiter, authController.emergencyLockdown);


router.get('/security-audit', authenticate, authController.getSecurityAudit);
router.get('/profile', authenticate, authController.getProfile);

router.delete('/delete-account', authenticate, generalLimiter, authController.deleteAccount);

router.get('/preferences', authenticate, authController.getPreferences);
router.put('/preferences', authenticate, authController.updatePreferences);
router.post('/update-cookie-consent', authenticate, authController.updateCookieConsent);


module.exports = router;
