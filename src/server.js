require('dotenv').config();

const app         = require('./app');
const config      = require('./shared/config/config');
const emailService = require('./shared/services/email.service');
const mongoose    = require('mongoose');
const { initializeWebSocket, broadcastSecurityEvent } = require('./shared/utils/websocket');
const { initRedis, closeRedis, isRedisReady } = require('./shared/middleware/rateLimiter');

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

// เชื่อมต่อฐานข้อมูล MongoDB
const connectDB = async () => {
  await mongoose.connect(config.MONGODB_URI);
  logger.info('MongoDB connected');
};

// เริ่มต้น server โดยเชื่อมต่อ DB, ตรวจสอบ email และ Redis ก่อน
const startServer = async () => {
  try {
    // 1. Connect DB
    try {
      await connectDB();
    } catch (dbError) {
      logger.error('Database connection failed:', dbError.message);
    }

    // 2. Email service
    const emailOk = await emailService.verifyConnection();
    if (!emailOk) {
      logger.warn('Email service unavailable — server will start anyway');
    }

    // 3. Initialize Redis
    try {
      await initRedis();
      const redisStatus = isRedisReady() ? 'Connected' : 'Using memory store';
      logger.info(`Redis: ${redisStatus}`);
    } catch (redisError) {
      logger.error('Redis initialization failed:', redisError.message);
      logger.warn('Continuing without Redis...');
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
