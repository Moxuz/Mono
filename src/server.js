require('dotenv').config();
const app = require('./app'); 
const config = require('./shared/config/config');


// Import logger with fallback
let logger;
try {
    logger = require('./shared/utils/logger');
    if (!logger.info) {
        throw new Error('Logger does not have info method');
    }
} catch (error) {
    console.warn('Logger not available, using console:', error.message);
    logger = console;
}

const PORT = config.PORT || 5000;

// Start server
const server = app.listen(PORT, () => {
    logger.info(`🚀 Monolithic Server running on http://localhost:${PORT}`);
    logger.info(`📊 Environment: ${config.NODE_ENV}`);
    logger.info(`🗄️  Database: ${config.MONGODB_URI ? 'Configured' : 'Not configured'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});