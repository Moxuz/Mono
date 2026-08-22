const mongoose = require('mongoose');
const config = require('../config/config');

// ถ้าไม่มี logger ให้ใช้ console แทน
let logger;
try {
    logger = require('./logger');
} catch (e) {
    logger = console;
}

let listenersAttached = false;

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    try {
        if (mongoose.connection.readyState === 2) {
            await mongoose.connection.asPromise();
            return mongoose.connection;
        }

        const conn = await mongoose.connect(config.MONGODB_URI, {
            serverSelectionTimeoutMS: config.MONGO_SERVER_SELECTION_TIMEOUT_MS,
            connectTimeoutMS: config.MONGO_CONNECT_TIMEOUT_MS,
            socketTimeoutMS: config.MONGO_CONNECT_TIMEOUT_MS,
            family: 4
        });

        logger.info(`MongoDB Connected: ${conn.connection.host}`);

        if (!listenersAttached) {
            mongoose.connection.on('error', (err) => {
                logger.error('MongoDB connection error:', err);
            });

            mongoose.connection.on('disconnected', () => {
                logger.warn('MongoDB disconnected. Attempting to reconnect...');
            });

            mongoose.connection.on('reconnected', () => {
                logger.info('MongoDB reconnected');
            });

            listenersAttached = true;
        }

        return conn;

    } catch (error) {
        logger.error('MongoDB connection failed:', error.message);
        // Keep local development and route-level smoke tests usable when
        // MongoDB is not installed. Production still fails fast because
        // authentication cannot be safely served without its database.
        if (config.NODE_ENV === 'production') {
            throw error;
        }
        return null;
    }
};

module.exports = connectDB;
