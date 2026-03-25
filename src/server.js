require('dotenv').config();

const app         = require('./app');
const config      = require('./shared/config/config');
const emailService = require('./shared/services/email.service');
const mongoose    = require('mongoose');
const { initializeWebSocket, broadcastSecurityEvent } = require('./shared/utils/websocket');
const { initRedis, closeRedis, isRedisReady } = require('./shared/middleware/rateLimiter');

// ─── Logger with fallback ─────────────────────────────────────────────────────
let logger;
try {
  logger = require('./shared/utils/logger');
  if (!logger.info) throw new Error('Logger does not have info method');
} catch (error) {
  console.warn('Logger not available, using console:', error.message);
  logger = console;
}

const PORT = config.PORT || 5000;

// ─── Connect DB ───────────────────────────────────────────────────────────────
const connectDB = async () => {
  await mongoose.connect(config.MONGODB_URI);
  logger.info('🗄️  MongoDB connected');
};

// ─── Start Server ─────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    // 1. Connect DB (เพิ่ม Error Handling)
    try {
      await connectDB();
    } catch (dbError) {
      logger.error('❌ Database connection failed:', dbError.message);
      // ถ้า DB ไม่เชื่อมต่อ Server ควรหยุด (เพราะ App จะทำงานไม่ได้)
      // process.exit(1); // <--- อย่านำออกถ้า DB สำคัญ แต่ถ้าต้องการ Test ให้ Comment
    }

    // 2. Email service
    const emailOk = await emailService.verifyConnection();
    if (!emailOk) {
      logger.warn('⚠️ Email service unavailable — server will start anyway');
    }

    // 3. Initialize Redis (สำคัญ: อย่าให้ Redis Block Server)
    try {
      await initRedis();
      const redisStatus = isRedisReady() ? '✅ Connected' : '⚠️ Using memory store';
      logger.info(`📡 Redis: ${redisStatus}`);
    } catch (redisError) {
      logger.error('❌ Redis initialization failed:', redisError.message);
      logger.warn('⚠️ Continuing without Redis...');
      // อย่า process.exit(1) ตรงนี้ เพราะ Server ยังรันได้
    }

    // 4. Start HTTP server
    const httpServer = app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`📊 Environment: ${config.NODE_ENV}`);
    });

    // ... (ส่วน WebSocket และ Shutdown เหมือนเดิม)

  } catch (error) {
    logger.error('❌ Server failed to start:', error.message);
    console.error(error); // 👈 เพิ่มบรรทัดนี้เพื่อดู Error จริงใน Terminal
    process.exit(1);
  }
};

// ─── Global Error Handlers ────────────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// ─── Run ──────────────────────────────────────────────────────────────────────
startServer();