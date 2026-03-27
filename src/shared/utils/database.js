const mongoose = require('mongoose');
const config = require('../config/config');

// ถ้าไม่มี logger ให้ใช้ console แทน
let logger;
try {
    logger = require('./logger');
} catch (e) {
    logger = console;
}

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(config.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        logger.info(`MongoDB Connected: ${conn.connection.host}`);
        
        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });

    } catch (error) {
        logger.error('MongoDB connection failed:', error.message);
        // Don't exit in development
        if (config.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
};

module.exports = connectDB;