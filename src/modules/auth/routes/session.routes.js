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

// Revoke specific session
router.delete('/:sessionId', sessionController.revokeSession);

// Revoke all other sessions (keep current) 
router.delete('/others/all', requireSession, sessionController.revokeAllOtherSessions);

// Revoke all sessions (logout everywhere)
router.delete('/all', sessionController.revokeAllSessions);

module.exports = router;