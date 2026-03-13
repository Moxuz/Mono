const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/authenticate');
const {
    loginLimiter,
    registerLimiter,
    forgotPasswordLimiter,
} = require('../../../shared/middleware/rateLimiter'); // ⭐ เพิ่ม

// Local authentication
router.post('/register',       registerLimiter,       authController.register);
router.post('/login',          loginLimiter,           authController.login);
router.post('/logout',         authenticate,           authController.logout);
router.post('/refresh-token',                          authController.refreshToken);
router.post('/validate-token',                         authController.validateToken);

// Google OAuth
router.get('/google',          authController.googleAuth);
router.get('/google/callback', authController.googleCallback);

// Password reset
router.post('/forgot-password',       forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password/:token',                        authController.resetPassword);

module.exports = router;