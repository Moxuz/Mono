require('dotenv').config();
const app = require('./app');
const config = require('./shared/config/config');
const logger = require('./shared/utils/logger');

const PORT = config.PORT || 5000;

// Start server
app.listen(PORT, () => {
    logger.info(`🚀 Monolithic Server running on http://localhost:${PORT}`);
    logger.info(`📊 Environment: ${config.NODE_ENV}`);
    logger.info(`🗄️  Database: ${config.MONGODB_URI ? 'Connected' : 'Not configured'}`);
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
