const express = require('express');
const router = express.Router();
const {
    getRealTimeMonitoring,
    getSystemHealth,
    getLoginChartData,
    getSecurityEvents,
    getMetricsSummary
} = require('../controllers/monitoring.controller');
const { authenticate } = require('../../auth/middleware/authenticate');
const { authorizeRole } = require('../../auth/middleware/authorization');

/**
 * @swagger
 * tags:
 *   name: Monitoring
 *   description: Real-time monitoring and system health endpoints
 */

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/dashboard/monitoring/realtime:
 *   get:
 *     summary: Get real-time monitoring data
 *     description: Get active users, recent login attempts, and system metrics
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Real-time monitoring data
 */
router.get('/realtime', authorizeRole('admin'), getRealTimeMonitoring);

/**
 * @swagger
 * /api/dashboard/monitoring/health:
 *   get:
 *     summary: Get system health status
 *     description: Get system health score and detailed metrics
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System health status
 */
router.get('/health', authorizeRole('admin'), getSystemHealth);

/**
 * @swagger
 * /api/dashboard/monitoring/login-chart:
 *   get:
 *     summary: Get login attempts chart data
 *     description: Get login statistics grouped by hour for charting
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *     responses:
 *       200:
 *         description: Login chart data
 */
router.get('/login-chart', authorizeRole('admin'), getLoginChartData);

/**
 * @swagger
 * /api/dashboard/monitoring/security-events:
 *   get:
 *     summary: Get security events timeline
 *     description: Get recent security events for monitoring
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Security events timeline
 */
router.get('/security-events', authorizeRole('admin'), getSecurityEvents);

/**
 * @swagger
 * /api/dashboard/monitoring/metrics:
 *   get:
 *     summary: Get metrics summary
 *     description: Get overall dashboard metrics summary
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics summary
 */
router.get('/metrics', authorizeRole('admin'), getMetricsSummary);

module.exports = router;
