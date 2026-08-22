require('dotenv').config();

const app         = require('./app');
const config      = require('./shared/config/config');
const emailService = require('./shared/services/email.service');
const mongoose    = require('mongoose');
const connectDB   = require('./shared/utils/database');
const { initializeWebSocket, broadcastSecurityEvent } = require('./shared/utils/websocket');
const { initRedis, closeRedis, isRedisReady } = require('./shared/middleware/rateLimiter');
const kafkaLogger = require('./shared/utils/kafkaLogger');

// Logger with fallback
let logger;
try {
  logger = require('./shared/utils/logger');
  if (!logger.info) throw new Error('Logger does not have info method');
} catch (error) {
  console.warn('Logger not available, using console:', error.message);
  logger = console;
}

const PORT = config.PORT || 5000;

// เริ่มต้น server โดยเชื่อมต่อ DB, ตรวจสอบ SMTP และ Redis ก่อน
const startServer = async () => {
  try {
    // 1. Connect DB. Production must fail fast if MongoDB is unavailable.
    await connectDB();

    // 2. Email service
    const emailOk = await emailService.verifyConnection();
    if (!emailOk) {
      logger.warn('Email service unavailable — server will start anyway');
    }

    // 3. Initialize Redis
    try {
      const redisReady = await initRedis();
      const redisStatus = isRedisReady() ? 'Connected' : 'Using memory store';
      logger.info(`Redis: ${redisStatus}`);
      if (config.REDIS_REQUIRED && !redisReady) {
        throw new Error('Redis is required but unavailable');
      }
    } catch (redisError) {
      logger.error('Redis initialization failed:', redisError.message);
      if (config.REDIS_REQUIRED) throw redisError;
      logger.warn('Continuing with in-memory rate limiting/session fallback...');
    }

    // Production must never silently fall back to express-session MemoryStore.
    if (config.NODE_ENV === 'production') {
      if (!config.USE_REDIS_SESSIONS) {
        throw new Error('Production requires USE_REDIS_SESSIONS=true');
      }
      const sessionReady = await app.locals.sessionStoreReady;
      if (!sessionReady) {
        throw new Error('Redis-backed session store is unavailable');
      }
    }

    // 4. Start HTTP server
    const httpServer = app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
    });

    // 5. Initialize WebSocket server (requires HTTP server to be started first)
    initializeWebSocket(httpServer);
    logger.info('WebSocket server initialized');

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.warn(`${signal} received — shutting down gracefully`);
      httpServer.close(async () => {
        try {
          await mongoose.connection.close();
          logger.info('MongoDB connection closed');
        } catch (err) {
          logger.error('MongoDB close error:', err.message);
        }
        try {
          await closeRedis();
          logger.info('Redis connection closed');
        } catch (err) {
          logger.error('Redis close error:', err.message);
        }
        try {
          await app.locals.closeSessionRedis?.();
          logger.info('Session store connection closed');
        } catch (err) {
          logger.error('Session store close error:', err.message);
        }
        if (config.USE_KAFKA_LOGGING) {
          try {
            await kafkaLogger.disconnectKafka();
            logger.info('Kafka producer disconnected');
          } catch (err) {
            logger.error('Kafka disconnect error:', err.message);
          }
        }
        logger.info('Server shutdown complete');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Server failed to start:', error.message);
    process.exit(1);
  }
};

// จัดการ error ที่ไม่ได้ถูก catch ไว้
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});

// จัดการ exception ที่ไม่ได้ถูก catch ไว้
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// เรียกใช้งาน server
startServer();
