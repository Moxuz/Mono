const express = require('express');
const router = express.Router();
const {
    getUserActivity,
    getUserSessions,
    revokeSession,
    revokeAllOtherSessions,
    getSecuritySummary,
    getLoginHistory
} = require('../controllers/user.controller');
const { authenticate } = require('../../auth/middleware/authenticate');

/**
 * @swagger
 * tags:
 *   name: User Dashboard
 *   description: User activity and session management endpoints
 */

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/dashboard/user/security-summary:
 *   get:
 *     summary: Get user's security summary
 *     tags: [User Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User security summary including recent logins and sessions
 */
router.get('/security-summary', getSecuritySummary);

/**
 * @swagger
 * /api/dashboard/user/activity:
 *   get:
 *     summary: Get user's activity logs
 *     tags: [User Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: User activity logs with pagination
 */
router.get('/activity', getUserActivity);

/**
 * @swagger
 * /api/dashboard/user/sessions:
 *   get:
 *     summary: Get user's active sessions
 *     tags: [User Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active sessions for the current user
 */
router.get('/sessions', getUserSessions);

/**
 * @swagger
 * /api/dashboard/user/sessions/{sessionId}/revoke:
 *   post:
 *     summary: Revoke a specific session
 *     tags: [User Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session revoked successfully
 */
router.post('/sessions/:sessionId/revoke', revokeSession);

/**
 * @swagger
 * /api/dashboard/user/sessions/revoke-all:
 *   post:
 *     summary: Revoke all other sessions (keep current)
 *     tags: [User Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All other sessions revoked successfully
 */
router.post('/sessions/revoke-all', revokeAllOtherSessions);

/**
 * @swagger
 * /api/dashboard/user/login-history:
 *   get:
 *     summary: Get user's login history
 *     tags: [User Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: User login history
 */
router.get('/login-history', getLoginHistory);

module.exports = router;
