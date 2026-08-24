const mongoose = require('mongoose');
const logger = require('../../../shared/utils/logger');
const kafkaLogger = require('../../../shared/utils/kafkaLogger');
const { isRedisReady } = require('../../../shared/middleware/rateLimiter');
const config = require('../../../shared/config/config');

/**
 * Small private-deployment health view used by the admin page. It reports only
 * dependency readiness and deliberately omits CPU, memory and host details.
 */
async function getSystemHealth(req, res) {
    try {
        res.set('Cache-Control', 'no-store');
        const redisRequired = config.REDIS_REQUIRED || config.USE_REDIS_SESSIONS;
        const kafkaStatus = kafkaLogger.getStatus();
        const dependencies = {
            mongodb: {
                status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
                required: true
            },
            redis: {
                status: isRedisReady() ? 'connected' : redisRequired ? 'disconnected' : 'disabled',
                required: redisRequired
            },
            kafka: {
                status: !config.USE_KAFKA_LOGGING
                    ? 'disabled'
                    : kafkaStatus.connected ? 'connected' : 'disconnected',
                required: false
            }
        };

        const issues = Object.entries(dependencies)
            .filter(([, dependency]) => dependency.required && dependency.status !== 'connected')
            .map(([name]) => `${name} is unavailable`);
        if (config.USE_KAFKA_LOGGING && dependencies.kafka.status !== 'connected') {
            issues.push('kafka logging is unavailable');
        }

        return res.json({
            success: true,
            data: {
                status: issues.length === 0 ? 'healthy' : 'degraded',
                dependencies,
                issues,
                checkedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Get system health failed:', error.message);
        return res.status(500).json({
            success: false,
            error: 'System health is unavailable'
        });
    }
}

module.exports = { getSystemHealth };
