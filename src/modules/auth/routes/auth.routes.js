const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/authenticate');



const {
    loginLimiter,
    registerLimiter,
    forgotPasswordLimiter,
    tokenLimiter,
} = require('../../../shared/middleware/rateLimiter'); 

// Local authentication
router.post('/register',       registerLimiter,       authController.register);
router.post('/login',          loginLimiter,           authController.login);
router.post('/logout',         authenticate,           authController.logout);
router.post('/refresh-token',                          authController.refreshToken);
router.post('/validate-token',                         authController.validateToken);
//router.post('/change-password',authenticate,           authController.changePassword);
router.get('/audit-logs',      authenticate,           authController.getAuditLogs);

// Email Verification
router.get('/verify-email',                            authController.verifyEmail);
router.post('/resend-verification',                    authController.resendVerificationEmail);


// Password reset

router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);  
router.post('/change-password', authenticate, authController.changePassword);

// Session Management (Protected)
router.get('/sessions',         authenticate, authController.getActiveSessions);
router.post('/sessions/revoke', authenticate, authController.revokeSession);
router.post('/sessions/revoke-all-others', authenticate, authController.revokeAllOtherSessions);
router.post('/emergency-lockdown', authenticate, authController.emergencyLockdown);


router.get('/security-audit', authenticate, authController.getSecurityAudit);
router.get('/profile', authenticate, authController.getProfile);

router.delete('/delete-account', authenticate, authController.deleteAccount);

router.get('/preferences', authenticate, authController.getPreferences);
router.put('/preferences', authenticate, authController.updatePreferences);

// OAuth session bridge — validates JWT, sets server session, then redirects to returnTo
router.get('/oauth-session', authController.setOAuthSession);

module.exports = router;