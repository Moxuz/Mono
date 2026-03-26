#!/usr/bin/env node

/**
 * Kafka Logging Test Script
 * Tests Kafka connectivity and log publishing
 * 
 * Usage:
 *   node scripts/test-kafka.js              # Run all tests
 *   node scripts/test-kafka.js --connect    # Test connection only
 *   node scripts/test-kafka.js --send       # Test sending messages
 *   node scripts/test-kafka.js --topics     # List topics
 *   node scripts/test-kafka.js --cleanup    # Cleanup test topics
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Kafka } = require('kafkajs');

// Configuration
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'test-kafka-client';
const USE_KAFKA = process.env.USE_KAFKA_LOGGING === 'true';

// Kafka topics
const TOPICS = {
    AUTH: 'auth-logs',
    SECURITY: 'security-events',
    ERROR: 'error-logs',
    USER_ACTIVITY: 'user-activity',
    ALL: 'application-logs',
    TEST: 'test-topic'
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    connect: args.includes('--connect') || args.includes('-c'),
    send: args.includes('--send') || args.includes('-s'),
    topics: args.includes('--topics') || args.includes('-t'),
    cleanup: args.includes('--cleanup'),
    all: !args.some(arg => arg.startsWith('-'))
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Create Kafka client
 */
function createKafkaClient() {
    return new Kafka({
        clientId: KAFKA_CLIENT_ID,
        brokers: [KAFKA_BROKER],
        retry: {
            retries: 3,
            initialRetryTime: 100,
            retryTime: 1000,
            maxRetryTime: 5000,
            factor: 2
        },
        connectionTimeout: 5000,
        requestTimeout: 10000
    });
}

/**
 * Test 1: Connection Test
 */
async function testConnection() {
    log('\n🔌 Test 1: Kafka Connection Test', 'blue');
    log('─'.repeat(60));
    
    const kafka = createKafkaClient();
    const admin = kafka.admin();
    
    try {
        log(`📡 Connecting to broker: ${KAFKA_BROKER}...`, 'blue');
        await admin.connect();
        log('✅ Successfully connected to Kafka broker!', 'green');
        
        // Get cluster info
        const clusterConfig = await admin.describeCluster();
        log(`📊 Cluster ID: ${clusterConfig.clusterId || 'N/A'}`, 'blue');
        log(`🖥️  Brokers: ${clusterConfig.brokers?.length || 0}`, 'blue');
        
        if (clusterConfig.brokers?.length > 0) {
            clusterConfig.brokers.forEach((broker, index) => {
                log(`   Broker ${index + 1}: ${broker.host}:${broker.port}`, 'blue');
            });
        }
        
        await admin.disconnect();
        log('✅ Disconnected successfully', 'green');
        
        return true;
    } catch (error) {
        log(`❌ Connection failed: ${error.message}`, 'red');
        log('\n💡 Troubleshooting:', 'yellow');
        log('   1. Make sure Kafka is running: docker-compose -f docker-compose.kafka.yml up -d', 'yellow');
        log('   2. Check broker address: ' + KAFKA_BROKER, 'yellow');
        log('   3. Verify network connectivity', 'yellow');
        return false;
    }
}

/**
 * Test 2: Topic Creation and Listing
 */
async function testTopics() {
    log('\n📋 Test 2: Topic Management', 'blue');
    log('─'.repeat(60));
    
    const kafka = createKafkaClient();
    const admin = kafka.admin();
    
    try {
        await admin.connect();
        log('✅ Connected to Kafka', 'green');
        
        // List existing topics
        log('\n📂 Existing Topics:', 'blue');
        const topics = await admin.listTopics();
        
        if (topics.length === 0) {
            log('   No topics found', 'yellow');
        } else {
            topics.forEach(topic => {
                const isTestTopic = topic.includes('test');
                const color = isTestTopic ? 'magenta' : 'blue';
                log(`   • ${topic}`, color);
            });
            log(`\n   Total: ${topics.length} topics`, 'blue');
        }
        
        // Create test topic if it doesn't exist
        if (!topics.includes(TOPICS.TEST)) {
            log(`\n🔨 Creating test topic: ${TOPICS.TEST}...`, 'blue');
            await admin.createTopics({
                topics: [{
                    topic: TOPICS.TEST,
                    numPartitions: 1,
                    replicationFactor: 1
                }]
            });
            log(`✅ Topic "${TOPICS.TEST}" created`, 'green');
        } else {
            log(`\n✅ Topic "${TOPICS.TEST}" already exists`, 'green');
        }
        
        // Get topic metadata
        log('\n📊 Topic Metadata:', 'blue');
        const metadata = await admin.fetchTopicMetadata({ topics: [TOPICS.TEST] });
        
        if (metadata.topics && metadata.topics.length > 0) {
            const topicMeta = metadata.topics[0];
            log(`   Topic: ${topicMeta.name}`, 'blue');
            log(`   Partitions: ${topicMeta.partitions?.length || 0}`, 'blue');
            
            if (topicMeta.partitions && topicMeta.partitions.length > 0) {
                topicMeta.partitions.forEach(partition => {
                    log(`   • Partition ${partition.partitionId}: Leader=${partition.leader}, Replicas=${partition.replicas.length}`, 'blue');
                });
            }
        }
        
        await admin.disconnect();
        log('\n✅ Disconnected successfully', 'green');
        
        return true;
    } catch (error) {
        log(`❌ Topic test failed: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Test 3: Send Messages
 */
async function testSendMessage() {
    log('\n📤 Test 3: Send Test Messages', 'blue');
    log('─'.repeat(60));
    
    const kafka = createKafkaClient();
    const producer = kafka.producer();
    
    try {
        log('📡 Connecting producer...', 'blue');
        await producer.connect();
        log('✅ Producer connected', 'green');
        
        // Test messages
        const testMessages = [
            {
                topic: TOPICS.AUTH,
                message: {
                    timestamp: new Date().toISOString(),
                    level: 'INFO',
                    message: 'Test authentication event',
                    metadata: {
                        userId: 'test-user-123',
                        action: 'login_success',
                        ipAddress: '192.168.1.100'
                    }
                }
            },
            {
                topic: TOPICS.SECURITY,
                message: {
                    timestamp: new Date().toISOString(),
                    level: 'WARN',
                    message: 'Test security event',
                    metadata: {
                        eventType: 'failed_login',
                        attempts: 3,
                        ipAddress: '192.168.1.100'
                    }
                }
            },
            {
                topic: TOPICS.ERROR,
                message: {
                    timestamp: new Date().toISOString(),
                    level: 'ERROR',
                    message: 'Test error event',
                    metadata: {
                        error: 'Test error message',
                        stack: 'Error: Test\n    at test.js:1:1'
                    }
                }
            }
        ];
        
        // Send messages
        for (const testMsg of testMessages) {
            log(`\n📨 Sending to topic: ${testMsg.topic}`, 'blue');
            
            const result = await producer.send({
                topic: testMsg.topic,
                messages: [
                    {
                        value: JSON.stringify(testMsg.message),
                        headers: {
                            level: testMsg.message.level,
                            timestamp: Date.now().toString()
                        }
                    }
                ]
            });
            
            log(`✅ Message sent successfully`, 'green');
            log(`   Topic: ${testMsg.topic}`, 'blue');
            log(`   Partition: ${result[0]?.partitions?.[0]?.partition || 'N/A'}`, 'blue');
            log(`   Offset: ${result[0]?.partitions?.[0]?.offset || 'N/A'}`, 'blue');
        }
        
        // Send batch to test topic
        log(`\n📨 Sending batch to test topic: ${TOPICS.TEST}`, 'blue');
        const batchMessages = Array(5).fill(null).map((_, i) => ({
            value: JSON.stringify({
                testId: i + 1,
                message: `Test message #${i + 1}`,
                timestamp: new Date().toISOString()
            })
        }));
        
        await producer.send({
            topic: TOPICS.TEST,
            messages: batchMessages
        });
        
        log(`✅ Batch sent: 5 messages`, 'green');
        
        await producer.disconnect();
        log('✅ Producer disconnected', 'green');
        
        return true;
    } catch (error) {
        log(`❌ Send message test failed: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Test 4: Consume Messages (Brief)
 */
async function testConsumeMessage() {
    log('\n📥 Test 4: Consume Test Messages', 'blue');
    log('─'.repeat(60));
    
    const kafka = createKafkaClient();
    const consumer = kafka.consumer({ groupId: 'test-consumer-group' });
    
    try {
        log('📡 Connecting consumer...', 'blue');
        await consumer.connect();
        log('✅ Consumer connected', 'green');
        
        log(`\n📌 Subscribing to topic: ${TOPICS.TEST}`, 'blue');
        await consumer.subscribe({ topic: TOPICS.TEST, fromBeginning: true });
        
        log('👂 Listening for messages (5 seconds)...', 'blue');
        
        let messageCount = 0;
        const timeout = 5000; // 5 seconds
        
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                messageCount++;
                const value = message.value.toString();
                const headers = message.headers;
                
                log(`\n📨 Message #${messageCount} received`, 'green');
                log(`   Topic: ${topic}`, 'blue');
                log(`   Partition: ${partition}`, 'blue');
                log(`   Offset: ${message.offset}`, 'blue');
                log(`   Headers: ${JSON.stringify(headers)}`, 'blue');
                log(`   Value: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`, 'blue');
            }
        });
        
        // Wait for messages
        await new Promise(resolve => setTimeout(resolve, timeout));
        
        await consumer.disconnect();
        log(`\n✅ Consumer disconnected`, 'green');
        log(`📊 Total messages received: ${messageCount}`, 'blue');
        
        return true;
    } catch (error) {
        log(`❌ Consume message test failed: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Cleanup test topics
 */
async function cleanupTopics() {
    log('\n🧹 Cleanup Test Topics', 'blue');
    log('─'.repeat(60));
    
    const kafka = createKafkaClient();
    const admin = kafka.admin();
    
    try {
        await admin.connect();
        log('✅ Connected to Kafka', 'green');
        
        const topics = await admin.listTopics();
        const testTopics = topics.filter(t => t.includes('test'));
        
        if (testTopics.length === 0) {
            log('No test topics to cleanup', 'yellow');
        } else {
            log(`\n🗑️  Deleting test topics: ${testTopics.join(', ')}`, 'blue');
            await admin.deleteTopics({ topics: testTopics });
            log(`✅ Deleted ${testTopics.length} test topics`, 'green');
        }
        
        await admin.disconnect();
        log('✅ Disconnected successfully', 'green');
        
        return true;
    } catch (error) {
        log(`❌ Cleanup failed: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Run all tests
 */
async function runAllTests() {
    log('\n' + '═'.repeat(60), 'magenta');
    log('🚀 Kafka Comprehensive Test Suite', 'magenta');
    log('═'.repeat(60), 'magenta');
    
    log(`\n⚙️  Configuration:`, 'blue');
    log(`   Broker: ${KAFKA_BROKER}`, 'blue');
    log(`   Client ID: ${KAFKA_CLIENT_ID}`, 'blue');
    log(`   Kafka Enabled: ${USE_KAFKA}`, 'blue');
    
    const results = {
        connection: false,
        topics: false,
        send: false,
        consume: false
    };
    
    // Test 1: Connection
    results.connection = await testConnection();
    if (!results.connection) {
        log('\n⚠️  Skipping remaining tests due to connection failure', 'yellow');
        printSummary(results);
        return false;
    }
    
    // Test 2: Topics
    results.topics = await testTopics();
    
    // Test 3: Send
    results.send = await testSendMessage();
    
    // Test 4: Consume
    results.consume = await testConsumeMessage();
    
    // Print summary
    printSummary(results);
    
    return Object.values(results).every(r => r);
}

/**
 * Print test summary
 */
function printSummary(results) {
    log('\n' + '═'.repeat(60), 'magenta');
    log('📊 Test Summary', 'magenta');
    log('═'.repeat(60), 'magenta');
    
    const tests = [
        { name: 'Connection Test', result: results.connection },
        { name: 'Topic Test', result: results.topics },
        { name: 'Send Message Test', result: results.send },
        { name: 'Consume Message Test', result: results.consume }
    ];
    
    tests.forEach(test => {
        const icon = test.result ? '✅' : test.result === false ? '❌' : '⚠️';
        const color = test.result ? 'green' : 'red';
        log(`${icon} ${test.name}`, color);
    });
    
    const passed = Object.values(results).filter(r => r).length;
    const total = Object.values(results).length;
    
    log('\n' + '─'.repeat(60), 'blue');
    log(`📈 Results: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');
    log('═'.repeat(60), 'magenta');
    
    if (passed === total) {
        log('\n🎉 All tests passed! Kafka is working correctly!', 'green');
    } else {
        log('\n⚠️  Some tests failed. Check the errors above.', 'yellow');
    }
    log('');
}

/**
 * Main execution
 */
async function main() {
    try {
        if (options.cleanup) {
            await cleanupTopics();
        } else if (options.connect) {
            await testConnection();
        } else if (options.topics) {
            await testTopics();
        } else if (options.send) {
            await testSendMessage();
        } else if (options.all || true) {
            await runAllTests();
        }
    } catch (error) {
        log(`\n❌ Fatal error: ${error.message}`, 'red');
        log(error.stack, 'red');
        process.exit(1);
    }
}

// Run main
main();
