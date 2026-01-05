const path = require('path');
const fs = require('fs');

// Create logs directory
const logsDir = path.join(__dirname, '../../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Simple logger without winston
const logger = {
    info: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [INFO]: ${message} ${JSON.stringify(meta)}`;
        console.log('\x1b[36m%s\x1b[0m', logMessage); // Cyan
        appendToFile('combined.log', logMessage);
    },
    
    error: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [ERROR]: ${message} ${JSON.stringify(meta)}`;
        console.error('\x1b[31m%s\x1b[0m', logMessage); // Red
        appendToFile('error.log', logMessage);
        appendToFile('combined.log', logMessage);
    },
    
    warn: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [WARN]: ${message} ${JSON.stringify(meta)}`;
        console.warn('\x1b[33m%s\x1b[0m', logMessage); // Yellow
        appendToFile('combined.log', logMessage);
    },
    
    debug: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [DEBUG]: ${message} ${JSON.stringify(meta)}`;
        console.debug('\x1b[35m%s\x1b[0m', logMessage); // Magenta
        appendToFile('combined.log', logMessage);
    },

    // Stream for Morgan
    stream: {
        write: (message) => {
            const timestamp = new Date().toISOString();
            const logMessage = `${timestamp} [HTTP]: ${message.trim()}`;
            console.log(logMessage);
            appendToFile('combined.log', logMessage);
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

module.exports = logger;
