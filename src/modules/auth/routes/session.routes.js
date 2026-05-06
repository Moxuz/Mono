// src/modules/auth/routes/session.routes.js

const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/session.controller');
const { authenticate, requireSession } = require('../middleware/authenticate'); 

// All session routes require authentication
router.use(authenticate);

// Get all active sessions
router.get('/', sessionController.getSessions);

// Get session count
router.get('/count', sessionController.getSessionCount);

// Revoke all other sessions (keep current) — must be before /:sessionId
router.delete('/others/all', requireSession, sessionController.revokeAllOtherSessions);

// Revoke all sessions (logout everywhere) — must be before /:sessionId
router.delete('/all', sessionController.revokeAllSessions);

// Revoke specific session
router.delete('/:sessionId', sessionController.revokeSession);

module.exports = router;