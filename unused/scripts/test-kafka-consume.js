#!/usr/bin/env node

/**
 * Kafka Consumer Test
 * Tests message consumption from Kafka topics
 * 
 * Usage:
 *   node scripts/test-kafka-consume.js
 */

const { Kafka } = require('kafkajs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const TEST_TOPIC = 'test-topic';

// Colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testConsumer() {
    log('\n📥 Kafka Consumer Test', 'blue');
    log('─'.repeat(60));
    
    const kafka = new Kafka({
        clientId: 'test-consumer',
        brokers: [KAFKA_BROKER],
        retry: {
            retries: 5,
            initialRetryTime: 100,
            retryTime: 1000
        }
    });
    
    const consumer = kafka.consumer({ 
        groupId: 'test-consumer-group-' + Date.now() 
    });
    
    try {
        log('📡 Connecting consumer...', 'blue');
        await consumer.connect();
        log('✅ Consumer connected', 'green');
        
        log(`\n📌 Subscribing to topic: ${TEST_TOPIC}`, 'blue');
        await consumer.subscribe({ 
            topic: TEST_TOPIC, 
            fromBeginning: true 
        });
        
        log('👂 Listening for messages (10 seconds)...\n', 'blue');
        
        let messageCount = 0;
        const maxMessages = 10;
        const timeout = 10000; // 10 seconds
        
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                messageCount++;
                const value = message.value.toString();
                
                log(`📨 Message #${messageCount}`, 'green');
                log(`   Topic: ${topic}`, 'blue');
                log(`   Partition: ${partition}`, 'blue');
                log(`   Offset: ${message.offset}`, 'blue');
                log(`   Key: ${message.key?.toString() || 'null'}`, 'blue');
                
                // Parse and display message
                try {
                    const parsed = JSON.parse(value);
                    log(`   Level: ${parsed.level || 'N/A'}`, 'blue');
                    log(`   Message: ${parsed.message || 'N/A'}`, 'blue');
                    log(`   Timestamp: ${parsed.timestamp || 'N/A'}`, 'blue');
                    if (parsed.metadata) {
                        log(`   Metadata: ${JSON.stringify(parsed.metadata)}`, 'blue');
                    }
                } catch {
                    log(`   Value: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`, 'blue');
                }
                
                log('');
                
                // Stop after max messages
                if (messageCount >= maxMessages) {
                    await consumer.disconnect();
                }
            }
        });
        
        // Wait for messages or timeout
        await new Promise(resolve => setTimeout(resolve, timeout));
        
        await consumer.disconnect();
        
        if (messageCount > 0) {
            log(`\n✅ Consumer test PASSED`, 'green');
            log(`📊 Total messages received: ${messageCount}`, 'blue');
        } else {
            log(`\n⚠️  No messages received in ${timeout/1000} seconds`, 'yellow');
            log('💡 This might mean:', 'yellow');
            log('   1. No messages in topic (run test-kafka.js --send first)', 'yellow');
            log('   2. Kafka still initializing (wait a few minutes)', 'yellow');
            log('   3. Consumer group issues (try different group ID)', 'yellow');
        }
        
        return messageCount > 0;
    } catch (error) {
        log(`❌ Consumer test failed: ${error.message}`, 'red');
        log(error.stack, 'red');
        
        // Try to disconnect
        try {
            await consumer.disconnect();
        } catch {}
        
        return false;
    }
}

// Run test
testConsumer()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        log(`\n❌ Fatal error: ${error.message}`, 'red');
        process.exit(1);
    });
