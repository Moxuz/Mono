/**
 * Redis Health Check Endpoint
 * GET /api/health/redis
 */

const express = require('express');
const router = express.Router();
const { getRedisClient, isRedisReady } = require('../../../shared/middleware/rateLimiter');
const { authenticate } = require('../../auth/middleware/authenticate');
const { authorizeRole } = require('../../auth/middleware/authorization');

/**
 * @swagger
 * /api/health/redis:
 *   get:
 *     summary: Check Redis health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Redis health status
 */
router.get('/', authenticate, authorizeRole('admin'), async (req, res) => {
    try {
        const redisClient = getRedisClient();
        
        if (!redisClient) {
            return res.status(503).json({
                success: false,
                status: 'disconnected',
                message: 'Redis client not initialized'
            });
        }

        // Ping Redis
        const pingStart = Date.now();
        const pingResult = await redisClient.ping();
        const pingTime = Date.now() - pingStart;

        // Get Redis info
        const info = await redisClient.info('server');
        
        // Parse Redis version
        const versionMatch = info.match(/redis_version:(\d+\.\d+\.\d+)/);
        const redisVersion = versionMatch ? versionMatch[1] : 'unknown';

        // Get memory info
        const memoryInfo = await redisClient.info('memory');
        const usedMemoryMatch = memoryInfo.match(/used_memory_human:([^\r\n]+)/);
        const usedMemory = usedMemoryMatch ? usedMemoryMatch[1] : 'unknown';

        const isConnected = isRedisReady();

        res.json({
            success: isConnected,
            status: isConnected ? 'connected' : 'disconnected',
            ping: `${pingTime}ms`,
            redis: {
                version: redisVersion,
                usedMemory
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
