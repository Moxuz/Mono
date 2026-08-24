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
const { redactText, redactLogMetadata } = require('./auditIdentity');

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
function safeMessage(message) {
    return typeof message === 'string' ? redactText(message) : message;
}

function safeMetadata(metadata) {
    return redactLogMetadata(metadata || {});
}

function safeJson(value) {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return JSON.stringify({ error: 'unserializable_log_metadata' });
    }
}

const logger = {
    info: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const redactedMessage = safeMessage(message);
        const redactedMeta = safeMetadata(meta);
        const logMessage = `${timestamp} [INFO]: ${redactedMessage} ${safeJson(redactedMeta)}`;
        console.log('\x1b[36m%s\x1b[0m', logMessage); // Cyan
        appendToFile('combined.log', logMessage);

        // Send to Kafka (async, non-blocking)
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.AUTH,
                'INFO',
                redactedMessage,
                { ...redactedMeta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    error: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const redactedMessage = safeMessage(message);
        const redactedMeta = safeMetadata(meta);
        const logMessage = `${timestamp} [ERROR]: ${redactedMessage} ${safeJson(redactedMeta)}`;
        console.error('\x1b[31m%s\x1b[0m', logMessage); // Red
        appendToFile('error.log', logMessage);
        appendToFile('combined.log', logMessage);

        // Send to Kafka (async, non-blocking)
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.ERROR,
                'ERROR',
                redactedMessage,
                { ...redactedMeta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    warn: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const redactedMessage = safeMessage(message);
        const redactedMeta = safeMetadata(meta);
        const logMessage = `${timestamp} [WARN]: ${redactedMessage} ${safeJson(redactedMeta)}`;
        console.warn('\x1b[33m%s\x1b[0m', logMessage); // Yellow
        appendToFile('combined.log', logMessage);

        // Send to Kafka (async, non-blocking)
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.ALL,
                'WARN',
                redactedMessage,
                { ...redactedMeta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    debug: (message, meta = {}) => {
        if (NODE_ENV === 'production') return; // suppress debug logs in production
        const timestamp = new Date().toISOString();
        const redactedMessage = safeMessage(message);
        const redactedMeta = safeMetadata(meta);
        const logMessage = `${timestamp} [DEBUG]: ${redactedMessage} ${safeJson(redactedMeta)}`;
        console.debug('\x1b[35m%s\x1b[0m', logMessage); // Magenta
        appendToFile('combined.log', logMessage);

        // Send to Kafka (async, non-blocking)
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.ALL,
                'DEBUG',
                redactedMessage,
                { ...redactedMeta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    // Security event logging (sends to security topic)
    security: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const redactedMessage = safeMessage(message);
        const redactedMeta = safeMetadata(meta);
        const logMessage = `${timestamp} [SECURITY]: ${redactedMessage} ${safeJson(redactedMeta)}`;
        console.warn('\x1b[33m%s\x1b[0m', logMessage); // Yellow
        appendToFile('error.log', logMessage);
        appendToFile('combined.log', logMessage);

        // Send to Kafka security topic
        if (USE_KAFKA) {
            kafkaLogger.logToKafka(
                kafkaLogger.TOPICS.SECURITY,
                'SECURITY',
                redactedMessage,
                { ...redactedMeta, hostname: HOSTNAME, pid: PID }
            ).catch(() => {}); // Ignore Kafka errors
        }
    },

    // Stream for Morgan
    stream: {
        write: (message) => {
            const timestamp = new Date().toISOString();
            const redactedMessage = redactText(message.trim());
            const logMessage = `${timestamp} [HTTP]: ${redactedMessage}`;
            console.log(logMessage);
            appendToFile('combined.log', logMessage);

            // Send HTTP logs to Kafka
            if (USE_KAFKA) {
                kafkaLogger.logToKafka(
                    kafkaLogger.TOPICS.USER_ACTIVITY,
                    'HTTP',
                    redactedMessage,
                    { hostname: HOSTNAME, pid: PID }
                ).catch(() => {}); // Ignore Kafka errors
            }
        }
    }
};

// Returns today's date string YYYY-MM-DD
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

// Helper function to append to a daily-rotated log file
// e.g. combined.log → combined-2026-03-28.log
function appendToFile(filename, message) {
    try {
        const [base, ext] = filename.includes('.')
            ? [filename.slice(0, filename.lastIndexOf('.')), filename.slice(filename.lastIndexOf('.'))]
            : [filename, ''];
        const rotatedName = `${base}-${todayStr()}${ext}`;
        const filepath = path.join(logsDir, rotatedName);
        fs.appendFileSync(filepath, message + '\n');
    } catch (error) {
        // Silently fail if can't write to file
    }
}

// Clean up log files older than 14 days on startup
function cleanupOldLogs() {
    try {
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const files = fs.readdirSync(logsDir);
        for (const file of files) {
            if (!/\d{4}-\d{2}-\d{2}/.test(file)) continue; // only dated files
            const filepath = path.join(logsDir, file);
            const stat = fs.statSync(filepath);
            if (stat.mtimeMs < cutoff) fs.unlinkSync(filepath);
        }
    } catch (e) {
        // Non-critical
    }
}
cleanupOldLogs();

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
