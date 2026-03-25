const express = require('express');
const router = express.Router();
const twoFAController = require('../controllers/2fa.controller');
const { authenticate } = require('../../auth/middleware/authenticate');

// All 2FA routes require authentication
router.use(authenticate);

// Generate 2FA secret
router.post('/secret', twoFAController.generateSecret);

// Verify and enable 2FA
router.post('/enable', twoFAController.verifyAndEnable);

// Disable 2FA
router.post('/disable', twoFAController.disable);

// Get 2FA status
router.get('/status', twoFAController.getStatus);

// Regenerate backup codes
router.post('/backup-codes', twoFAController.regenerateBackupCodes);

// Verify 2FA token (for login flow - uses temp session)
router.post('/verify', twoFAController.verifyToken);

module.exports = router;
