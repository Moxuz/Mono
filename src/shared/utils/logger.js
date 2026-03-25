const path = require('path');
const fs = require('fs');
const os = require('os');

// Create logs directory
const logsDir = path.join(__dirname, '../../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Kafka logger (optional)
const kafkaLogger = require('./kafkaLogger');

// Configuration
const USE_KAFKA = process.env.USE_KAFKA_LOGGING === 'true';
const NODE_ENV = process.env.NODE_ENV || 'development';
const HOSTNAME = os.hostname();
const PID = process.pid;

// Initialize Kafka on startup
if (USE_KAFKA) {
    kafkaLogger.connectKafka().catch(err => {
        console.warn('Kafka initialization failed, using file logging only');
    });
}

// Simple logger without winston
const logger = {
    info: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [INFO]: ${message} ${JSON.stringify(meta)}`;
        console.log('\x1b[36m%s\x1b[0m', logMessage); // Cyan
        appendToFile('combined.log', logMessage);

        // Send to Kafka (async, non-blocking)
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.AUTH,
                'INFO',
                message,
                { ...meta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    error: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [ERROR]: ${message} ${JSON.stringify(meta)}`;
        console.error('\x1b[31m%s\x1b[0m', logMessage); // Red
        appendToFile('error.log', logMessage);
        appendToFile('combined.log', logMessage);

        // Send to Kafka (async, non-blocking)
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.ERROR,
                'ERROR',
                message,
                { ...meta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    warn: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [WARN]: ${message} ${JSON.stringify(meta)}`;
        console.warn('\x1b[33m%s\x1b[0m', logMessage); // Yellow
        appendToFile('combined.log', logMessage);

        // Send to Kafka (async, non-blocking)
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.ALL,
                'WARN',
                message,
                { ...meta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    debug: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [DEBUG]: ${message} ${JSON.stringify(meta)}`;
        console.debug('\x1b[35m%s\x1b[0m', logMessage); // Magenta
        appendToFile('combined.log', logMessage);

        // Send to Kafka (async, non-blocking)
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.ALL,
                'DEBUG',
                message,
                { ...meta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    // Security event logging (sends to security topic)
    security: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [SECURITY]: ${message} ${JSON.stringify(meta)}`;
        console.warn('\x1b[33m%s\x1b[0m', logMessage); // Yellow
        appendToFile('error.log', logMessage);
        appendToFile('combined.log', logMessage);

        // Send to Kafka security topic
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.SECURITY,
                'SECURITY',
                message,
                { ...meta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    // Stream for Morgan
    stream: {
        write: (message) => {
            const timestamp = new Date().toISOString();
            const logMessage = `${timestamp} [HTTP]: ${message.trim()}`;
            console.log(logMessage);
            appendToFile('combined.log', logMessage);

            // Send HTTP logs to Kafka
            if (USE_KAFKA) {
                kafkaLogger.logToKafka(
                    kafkaLogger.TOPICS.USER_ACTIVITY,
                    'HTTP',
                    message.trim(),
                    { hostname: HOSTNAME, pid: PID }
                ).catch(() => {}); // Ignore Kafka errors
            }
        }
    }
};

// Helper function to append to file
function appendToFile(filename, message) {
    try {
        const filepath = path.join(logsDir, filename);
        fs.appendFileSync(filepath, message + '\n');
    } catch (error) {
        // Silently fail if can't write to file
    }
}

// Graceful shutdown - disconnect Kafka
process.on('SIGTERM', async () => {
    if (USE_KAFKA) {
        await kafkaLogger.disconnectKafka();
    }
});

process.on('SIGINT', async () => {
    if (USE_KAFKA) {
        await kafkaLogger.disconnectKafka();
    }
});

module.exports = logger;
