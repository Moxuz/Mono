/**
 * Kafka Logger - Optional distributed logging
 *
 * Usage:
 * 1. Set USE_KAFKA_LOGGING=true in .env
 * 2. Set KAFKA_BROKER=localhost:9092 (or your Kafka broker)
 * 3. Kafka logs will be sent automatically alongside file logs
 *
 * Free alternative: Use file logging only (default)
 */

const { Kafka, Partitioners } = require('kafkajs');
const config = require('../config/config');

// Kafka configuration
const KAFKA_ENABLED = config.USE_KAFKA_LOGGING;
const KAFKA_BROKER = config.KAFKA_BROKER;
const KAFKA_CLIENT_ID = config.KAFKA_CLIENT_ID;
const KAFKA_RETRIES = config.KAFKA_RETRIES;

let producer = null;
let isConnected = false;
let connectPromise = null;
let retryAfter = 0;
let shuttingDown = false;
const RETRY_COOLDOWN_MS = 30_000;

// Log topics
const TOPICS = {
  AUTH: 'auth-logs',
  SECURITY: 'security-events',
  ERROR: 'error-logs',
  USER_ACTIVITY: 'user-activity',
  ALL: 'application-logs'
};

async function resetProducer() {
  const currentProducer = producer;
  producer = null;
  isConnected = false;
  if (!currentProducer) return;

  try {
    await Promise.race([
      currentProducer.disconnect(),
      new Promise(resolve => {
        const timer = setTimeout(resolve, 500);
        timer.unref?.();
      })
    ]);
  } catch (_) {
    // Best effort: logging transport failures must not stop authentication.
  }
}

// เริ่มต้นเชื่อมต่อ Kafka producer
const connectKafka = async () => {
  if (!KAFKA_ENABLED || shuttingDown) {
    return false;
  }

  if (isConnected && producer) {
    return true;
  }

  if (Date.now() < retryAfter) return false;

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    try {
      const kafka = new Kafka({
        clientId: KAFKA_CLIENT_ID,
        brokers: [KAFKA_BROKER],
        retry: {
          retries: KAFKA_RETRIES,
          initialRetryTime: 100,
          retryTime: 1000,
          maxRetryTime: 30000,
          factor: 2
        }
      });

      producer = kafka.producer({
        allowAutoTopicCreation: true,
        createPartitioner: Partitioners.LegacyPartitioner
      });

      const timeout = new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Kafka connection timed out')), config.KAFKA_CONNECT_TIMEOUT_MS);
        timer.unref?.();
      });
      await Promise.race([producer.connect(), timeout]);
      isConnected = true;
      retryAfter = 0;

      console.log(`Kafka connected to ${KAFKA_BROKER}`);
      return true;
    } catch (error) {
      console.warn(`Kafka connection failed: ${error.message}`);
      console.warn('Falling back to file logging only');
      retryAfter = Date.now() + RETRY_COOLDOWN_MS;
      await resetProducer();
      return false;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
};

// ส่ง log ไปยัง Kafka topic ที่ระบุ
const logToKafka = async (topic, level, message, metadata = {}) => {
  if (!KAFKA_ENABLED || shuttingDown) {
    return false;
  }
  if ((!isConnected || !producer) && !(await connectKafka())) return false;

  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata: {
        ...metadata,
        service: 'auth-service',
        hostname: require('os').hostname(),
        nodeId: process.pid,
        environment: config.NODE_ENV
      }
    };

    await producer.send({
      topic,
      messages: [
        {
          value: JSON.stringify(logEntry),
          headers: {
            level,
            timestamp: Date.now().toString()
          }
        }
      ]
    });

    return true;
  } catch (error) {
    // Don't throw - logging failure shouldn't break the app
    console.warn('Kafka log failed:', error.message);
    retryAfter = Date.now() + RETRY_COOLDOWN_MS;
    await resetProducer();
    return false;
  }
};

// ส่ง log หลายรายการพร้อมกันใน batch เดียว
const logBatchToKafka = async (logs) => {
  if (!KAFKA_ENABLED || shuttingDown) {
    return false;
  }
  if ((!isConnected || !producer) && !(await connectKafka())) return false;

  try {
    const messages = logs.map(log => ({
      value: JSON.stringify(log),
      headers: {
        level: log.level,
        timestamp: Date.now().toString()
      }
    }));

    await producer.send({
      topic: TOPICS.ALL,
      messages
    });

    return true;
  } catch (error) {
    console.warn('Kafka batch log failed:', error.message);
    retryAfter = Date.now() + RETRY_COOLDOWN_MS;
    await resetProducer();
    return false;
  }
};

// ตัดการเชื่อมต่อ Kafka producer
const disconnectKafka = async () => {
  shuttingDown = true;
  await resetProducer();
  connectPromise = null;
  console.log('Kafka disconnected');
};

// ดึงสถานะการเชื่อมต่อ Kafka ปัจจุบัน
const getStatus = () => ({
  enabled: KAFKA_ENABLED,
  connected: isConnected,
  retryScheduled: !isConnected && retryAfter > Date.now(),
  broker: KAFKA_BROKER,
  clientId: KAFKA_CLIENT_ID
});

module.exports = {
  connectKafka,
  logToKafka,
  logBatchToKafka,
  disconnectKafka,
  getStatus,
  TOPICS,
  producer: () => producer
};
