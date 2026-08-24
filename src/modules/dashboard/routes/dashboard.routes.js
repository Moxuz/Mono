const express = require('express');
const router = express.Router();
const { authorizeRole } = require('../../auth/middleware/authorization');
const { authenticate } = require('../../auth/middleware/authenticate');
const dashboardController = require('../controllers/dashboard.controller');

const logRoutes = require('./log.routes');
const monitoringRoutes = require('./monitoring.routes');

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard API endpoints
 */

// Mount sub-routes
router.use('/logs', logRoutes);
router.use('/monitoring', monitoringRoutes);

/**
 * @swagger
 * /api/dashboard/login-activity:
 *   get:
 *     summary: Get user login activity (last 7 days)
 *     description: Returns login activity chart data for the authenticated user
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login activity data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     days:
 *                       type: array
 *                       items:
 *                         type: string
 *                     counts:
 *                       type: array
 *                       items:
 *                         type: number
 *                     stats:
 *                       type: object
 */
// ดึงข้อมูล login activity ย้อนหลัง 7 วัน ของ user ที่ล็อกอินอยู่
router.get('/login-activity', authenticate, dashboardController.getLoginActivity);

/**
 * @swagger
 * /api/dashboard/:
 *   get:
 *     summary: Dashboard home
 *     description: Returns dashboard API information
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard API info
 */
router.get('/', authenticate, authorizeRole('admin'), (req, res) => {
    res.json({
        success: true,
        message: 'Dashboard API',
        user: {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role
        },
        endpoints: {
            logs: '/api/dashboard/logs',
            health: '/api/dashboard/monitoring/health',
            loginActivity: '/api/dashboard/login-activity'
        }
    });
});

module.exports = router;
