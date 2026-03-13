require('dotenv').config();

const app         = require('./app');
const config      = require('./shared/config/config');
const emailService = require('./shared/services/email.service');
const mongoose    = require('mongoose');

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

    // 1. Connect DB
    await connectDB();

    // 2. Email service — ไม่ให้ crash ถ้า email ใช้ไม่ได้
    const emailOk = await emailService.verifyConnection();
    if (!emailOk) {
      logger.warn('⚠️  Email service unavailable — server will start anyway');
    }

    // 3. Start HTTP server
    const httpServer = app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`📊 Environment: ${config.NODE_ENV}`);
      logger.info(`🗄️  Database: ${config.MONGODB_URI ? 'Configured' : 'Not configured'}`);
    });

    // ─── Graceful Shutdown ──────────────────────────────────────────────────
    const shutdown = (signal) => {
      logger.info(`${signal} received — closing server`);
      httpServer.close(async () => {
        await mongoose.connection.close();
        logger.info('✅ Server closed gracefully');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));   // Ctrl+C

  } catch (error) {
    logger.error('❌ Server failed to start:', error.message);
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