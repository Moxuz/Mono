const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/authenticate');

console.log('Auth routes loaded'); // Debug log

// Local authentication
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authenticate, authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.post('/validate-token', authController.validateToken); // ⭐ ต้องมีบรรทัดนี้

// Google OAuth
router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);

// Password reset
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);

console.log('Auth routes:', router.stack.map(r => ({
    method: Object.keys(r.route.methods)[0].toUpperCase(),
    path: r.route.path
})));

module.exports = router;