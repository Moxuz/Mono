const express = require('express');
const router = express.Router();
const {
    getUserStats,
    getLoginStats,
    getSecurityStats,
    getAPIStats,
    getActivity,
    getGeographicData
} = require('../controllers/analytics.controller');
const { authenticate } = require('../../auth/middleware/authenticate');
const { authorizeRole } = require('../../auth/middleware/authorization');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Real-time analytics and statistics
 */

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorizeRole('admin'));

/**
 * @swagger
 * /api/dashboard/analytics/users:
 *   get:
 *     summary: Get user statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics
 */
router.get('/users', getUserStats);

/**
 * @swagger
 * /api/dashboard/analytics/logins:
 *   get:
 *     summary: Get login statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login statistics
 */
router.get('/logins', getLoginStats);

/**
 * @swagger
 * /api/dashboard/analytics/security:
 *   get:
 *     summary: Get security statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Security statistics
 */
router.get('/security', getSecurityStats);

/**
 * @swagger
 * /api/dashboard/analytics/api-stats:
 *   get:
 *     summary: Get API statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API statistics
 */
router.get('/api-stats', getAPIStats);

/**
 * @swagger
 * /api/dashboard/analytics/activity:
 *   get:
 *     summary: Get recent activity feed
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: Activity feed
 */
router.get('/activity', getActivity);

/**
 * @swagger
 * /api/dashboard/analytics/geographic:
 *   get:
 *     summary: Get geographic data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Geographic distribution
 */
router.get('/geographic', getGeographicData);

module.exports = router;
