const express = require('express');
const router = express.Router();
const {
    getSecurityLogs,
    getLoginHistory,
    getFailedLogins,
    getActiveSessions,
    exportLogs,
    getDashboardStats,
    getUserActivity
} = require('../controllers/log.controller');
const { authenticate } = require('../../auth/middleware/authenticate');
const { authorizeRole } = require('../../auth/middleware/authorization');

/**
 * @swagger
 * tags:
 *   name: Dashboard Logs
 *   description: Security logs and monitoring endpoints
 */

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Dashboard Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 */
// These are system-wide counts (users, sessions, logins), not per-user data.
// Keep the endpoint behind the same admin boundary as the other log views.
router.get('/stats', authorizeRole('admin'), getDashboardStats);

/**
 * @swagger
 * /api/dashboard/logs/security:
 *   get:
 *     summary: Get security audit logs
 *     tags: [Dashboard Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, failure]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Security logs with pagination
 */
router.get('/logs/security', authorizeRole('admin'), getSecurityLogs);

/**
 * @swagger
 * /api/dashboard/logs/logins:
 *   get:
 *     summary: Get login history
 *     tags: [Dashboard Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, success, failure]
 *           default: all
 *     responses:
 *       200:
 *         description: Login history
 */
router.get('/logs/logins', authorizeRole('admin'), getLoginHistory);

/**
 * @swagger
 * /api/dashboard/logs/failed-logins:
 *   get:
 *     summary: Get failed login attempts grouped by source
 *     tags: [Dashboard Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [ip, email]
 *           default: ip
 *     responses:
 *       200:
 *         description: Failed login attempts
 */
router.get('/logs/failed-logins', authorizeRole('admin'), getFailedLogins);

/**
 * @swagger
 * /api/dashboard/logs/sessions:
 *   get:
 *     summary: Get active sessions
 *     tags: [Dashboard Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Active sessions
 */
router.get('/logs/sessions', authorizeRole('admin'), getActiveSessions);

/**
 * @swagger
 * /api/dashboard/logs/export:
 *   get:
 *     summary: Export security logs to CSV
 *     tags: [Dashboard Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/logs/export', authorizeRole('admin'), exportLogs);

/**
 * @swagger
 * /api/dashboard/logs/user/{userId}/activity:
 *   get:
 *     summary: Get user activity timeline
 *     tags: [Dashboard Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: User activity timeline
 */
router.get('/logs/user/:userId/activity', authorizeRole('admin'), getUserActivity);

module.exports = router;
