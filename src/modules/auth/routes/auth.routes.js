const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// เช็คว่า controller มี function หรือไม่
console.log('Auth Controller:', Object.keys(authController));

// ถ้าไม่มี middleware ให้ comment ไว้ก่อน
// const { authenticate } = require('../middleware/authenticate');
// const { validateRegister, validateLogin } = require('../validators/auth.validator');

// Local authentication (ไม่ใช้ middleware ก่อน)
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.post('/validate-token', authController.validateToken);

// Google OAuth
router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);

// Password reset
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);

module.exports = router;