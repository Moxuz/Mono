/**
 * Kafka Log Monitor
 * Subscribes to ALL Kafka topics and prints formatted, color-coded logs.
 *
 * Usage:
 *   node scripts/check-kafka-logs.js
 *   KAFKA_BROKER=localhost:9092 node scripts/check-kafka-logs.js
 */

const { Kafka } = require('kafkajs');

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';

// All topics defined in kafkaLogger.js
const ALL_TOPICS = [
    'auth-logs',
    'security-events',
    'error-logs',
    'user-activity',
    'application-logs'
];

// ANSI color codes
const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
    cyan:    '\x1b[36m',
    white:   '\x1b[37m',
    bgRed:   '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgBlue:  '\x1b[44m',
};

const TOPIC_COLORS = {
    'auth-logs':        C.cyan,
    'security-events':  C.magenta,
    'error-logs':       C.red,
    'user-activity':    C.blue,
    'application-logs': C.yellow,
};

const LEVEL_COLORS = {
    INFO:     C.green,
    WARN:     C.yellow,
    ERROR:    C.red,
    SECURITY: C.magenta,
    DEBUG:    C.dim,
    HTTP:     C.blue,
};

function formatTimestamp(ts) {
    try {
        return new Date(ts).toLocaleTimeString('en-US', { hour12: false }) + '.' + new Date(ts).getMilliseconds().toString().padStart(3, '0');
    } catch {
        return ts || '??:??:??';
    }
}

function printMessage(topic, partition, offset, rawValue) {
    let log;
    try {
        log = JSON.parse(rawValue);
    } catch {
        // Not JSON — print raw
        const tc = TOPIC_COLORS[topic] || C.white;
        console.log(`${tc}[${topic}]${C.reset} ${rawValue}`);
        return;
    }

    const tc    = TOPIC_COLORS[topic] || C.white;
    const level = (log.level || 'INFO').toUpperCase();
    const lc    = LEVEL_COLORS[level] || C.white;
    const ts    = formatTimestamp(log.timestamp || log.metadata?.timestamp);
    const msg   = log.message || '(no message)';
    const meta  = log.metadata || {};

    // Build function label if available
    const fn = meta.function ? `${C.dim}[${meta.function}]${C.reset} ` : '';

    // Build key metadata string (skip noisy fields)
    const metaSkip = new Set(['service', 'hostname', 'nodeId', 'environment', 'pid', 'function']);
    const metaParts = Object.entries(meta)
        .filter(([k]) => !metaSkip.has(k))
        .map(([k, v]) => `${C.dim}${k}${C.reset}=${JSON.stringify(v)}`);
    const metaStr = metaParts.length ? `  ${metaParts.join(' ')}` : '';

    const header = `${C.dim}${ts}${C.reset} ${tc}${C.bold}[${topic.padEnd(17)}]${C.reset} ${lc}${C.bold}${level.padEnd(8)}${C.reset}`;

    console.log(`${header} ${fn}${msg}${metaStr}`);
    if (process.env.SHOW_OFFSET) {
        console.log(`${C.dim}  partition=${partition} offset=${offset}${C.reset}`);
    }
}

async function run() {
    console.log(`\n${C.bold}Kafka Log Monitor${C.reset}`);
    console.log(`${C.dim}Broker: ${KAFKA_BROKER}${C.reset}`);
    console.log(`${C.dim}Topics: ${ALL_TOPICS.join(', ')}${C.reset}\n`);

    const kafka = new Kafka({
        clientId: 'kafka-log-monitor-' + Date.now(),
        brokers: [KAFKA_BROKER],
        logLevel: 0, // suppress kafkajs internal logs
    });

    const consumer = kafka.consumer({
        groupId: 'log-monitor-' + Date.now() // unique group so we don't affect other consumers
    });

    try {
        console.log(`${C.yellow}Connecting to Kafka...${C.reset}`);
        await consumer.connect();
        console.log(`${C.green}✅ Connected. Subscribing to all topics...${C.reset}\n`);

        await consumer.subscribe({ topics: ALL_TOPICS, fromBeginning: false });

        // Topic summary line
        console.log(`${C.dim}─────────────────────────────────────────────────────────────────${C.reset}`);
        ALL_TOPICS.forEach(t => {
            const tc = TOPIC_COLORS[t] || C.white;
            console.log(`  ${tc}● ${t}${C.reset}`);
        });
        console.log(`${C.dim}─────────────────────────────────────────────────────────────────${C.reset}`);
        console.log(`${C.green}Listening for new messages... (Ctrl+C to stop)${C.reset}\n`);

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                printMessage(topic, partition, message.offset, message.value?.toString());
            },
        });
    } catch (err) {
        if (err.message?.includes('ECONNREFUSED') || err.message?.includes('connect')) {
            console.error(`\n${C.red}✗ Cannot connect to Kafka at ${KAFKA_BROKER}${C.reset}`);
            console.error(`${C.yellow}  Make sure Kafka is running:${C.reset}`);
            console.error(`  docker-compose up -d kafka\n`);
        } else {
            console.error(`${C.red}Error:${C.reset}`, err.message);
        }
        process.exit(1);
    }

    // Graceful shutdown
    const shutdown = async () => {
        console.log(`\n${C.yellow}Disconnecting...${C.reset}`);
        await consumer.disconnect();
        console.log(`${C.green}Done.${C.reset}`);
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

run();
