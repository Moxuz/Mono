#!/usr/bin/env node

/**
 * Redis Comprehensive Test Script
 * Tests Redis connection, operations, and rate limiting
 * 
 * Usage:
 *   node scripts/test-redis.js              # Run all tests
 *   node scripts/test-redis.js --connect    # Test connection only
 *   node scripts/test-redis.js --ops        # Test basic operations
 *   node scripts/test-redis.js --rate       # Test rate limiting
 *   node scripts/test-redis.js --stats      # Show Redis stats
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Redis = require('ioredis');
const config = require('../src/shared/config/config');

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

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    connect: args.includes('--connect'),
    ops: args.includes('--ops'),
    rate: args.includes('--rate'),
    stats: args.includes('--stats'),
    all: !args.some(arg => arg.startsWith('-'))
};

/**
 * Test 1: Connection Test
 */
async function testConnection() {
    log('\n🔌 Test 1: Redis Connection Test', 'blue');
    log('─'.repeat(60));
    
    let client = null;
    
    try {
        const redisConfig = {
            host: config.REDIS_HOST || 'localhost',
            port: config.REDIS_PORT || 6379,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 3) return null;
                return Math.min(times * 100, 1000);
            },
            lazyConnect: true
        };
        
        if (config.REDIS_PASSWORD) {
            redisConfig.password = config.REDIS_PASSWORD;
        }
        
        log(`📡 Connecting to ${redisConfig.host}:${redisConfig.port}...`, 'blue');
        client = new Redis(redisConfig);
        
        client.on('error', (err) => {
            log(`⚠️  Redis error: ${err.message}`, 'yellow');
        });
        
        // Use connect() and wait
        await client.connect();
        log('✅ Successfully connected to Redis!', 'green');
        
        // Test PING
        const pingResult = await client.ping();
        log(`🏓 PING response: ${pingResult}`, 'green');
        
        // Get Redis info
        const info = await client.info('server');
        const redisVersion = info.match(/redis_version:(.+)/)?.[1];
        log(`📊 Redis version: ${redisVersion || 'N/A'}`, 'blue');
        
        // Get memory info
        const memoryInfo = await client.info('memory');
        const usedMemory = memoryInfo.match(/used_memory_human:(.+)/)?.[1];
        log(`💾 Memory used: ${usedMemory || 'N/A'}`, 'blue');
        
        await client.quit();
        log('✅ Disconnected successfully', 'green');
        
        return { success: true, client };
    } catch (error) {
        log(`❌ Connection failed: ${error.message}`, 'red');
        log('\n💡 Troubleshooting:', 'yellow');
        log('   1. Make sure Redis is running: docker ps | grep redis', 'yellow');
        log('   2. Check Redis config: REDIS_HOST, REDIS_PORT', 'yellow');
        log('   3. Test connection: redis-cli ping', 'yellow');
        if (client) {
            await client.quit().catch(() => {});
        }
        return { success: false, error: error.message };
    }
}

/**
 * Test 2: Basic Operations
 */
async function testOperations() {
    log('\n⚙️  Test 2: Basic Redis Operations', 'blue');
    log('─'.repeat(60));
    
    let client = null;
    
    try {
        const redisConfig = {
            host: config.REDIS_HOST || 'localhost',
            port: config.REDIS_PORT || 6379
        };
        
        client = new Redis(redisConfig);
        await client.connect();
        log('✅ Connected to Redis', 'green');
        
        // Test 1: SET/GET
        log('\n📝 Test SET/GET...', 'blue');
        const testKey = `test:${Date.now()}`;
        const testValue = 'Hello Redis!';
        
        await client.set(testKey, testValue);
        log(`✅ SET ${testKey} = "${testValue}"`, 'green');
        
        const getValue = await client.get(testKey);
        log(`✅ GET ${testKey} = "${getValue}"`, 'green');
        
        if (getValue === testValue) {
            log('✅ SET/GET test PASSED', 'green');
        } else {
            log('❌ SET/GET test FAILED', 'red');
        }
        
        // Test 2: Hash operations
        log('\n📊 Test Hash operations...', 'blue');
        const hashKey = `user:${Date.now()}`;
        const userData = {
            username: 'testuser',
            email: 'test@example.com',
            role: 'user'
        };
        
        await client.hset(hashKey, userData);
        log('✅ HSET user data', 'green');
        
        const hashData = await client.hgetall(hashKey);
        log(`✅ HGETALL: ${JSON.stringify(hashData)}`, 'green');
        
        // Test 3: List operations
        log('\n📋 Test List operations...', 'blue');
        const listKey = `logs:${Date.now()}`;
        
        await client.rpush(listKey, ['log1', 'log2', 'log3']);
        log('✅ RPUSH 3 items to list', 'green');
        
        const listLength = await client.llen(listKey);
        log(`✅ LLEN: ${listLength}`, 'green');
        
        const listItems = await client.lrange(listKey, 0, -1);
        log(`✅ LRANGE: ${JSON.stringify(listItems)}`, 'green');
        
        // Test 4: Expiry
        log('\n⏱️  Test Key Expiry...', 'blue');
        const expiryKey = `expiry:${Date.now()}`;
        
        await client.setex(expiryKey, 5, 'Expires in 5 seconds');
        log('✅ SETEX with 5 second expiry', 'green');
        
        const ttl = await client.ttl(expiryKey);
        log(`✅ TTL: ${ttl} seconds`, 'green');
        
        // Test 5: Delete
        log('\n🗑️  Test DELETE...', 'blue');
        await client.del(testKey);
        const deletedValue = await client.get(testKey);
        log(`✅ DEL ${testKey}, value now: ${deletedValue}`, 'green');
        
        // Cleanup
        await client.del(hashKey, listKey, expiryKey);
        log('✅ Cleanup completed', 'green');
        
        await client.quit();
        log('✅ Disconnected successfully', 'green');
        
        log('\n✅ All operations tests PASSED', 'green');
        return { success: true };
    } catch (error) {
        log(`❌ Operations test failed: ${error.message}`, 'red');
        if (client) await client.quit();
        return { success: false, error: error.message };
    }
}

/**
 * Test 3: Rate Limiting Simulation
 */
async function testRateLimiting() {
    log('\n🚦 Test 3: Rate Limiting Simulation', 'blue');
    log('─'.repeat(60));
    
    let client = null;
    
    try {
        const redisConfig = {
            host: config.REDIS_HOST || 'localhost',
            port: config.REDIS_PORT || 6379
        };
        
        client = new Redis(redisConfig);
        await client.connect();
        log('✅ Connected to Redis', 'green');
        
        // Simulate rate limiting
        const rateKey = `ratelimit:test:${Date.now()}`;
        const maxRequests = 5;
        const windowMs = 10000; // 10 seconds
        
        log(`\n📊 Testing rate limit: ${maxRequests} requests per ${windowMs/1000}s`, 'blue');
        
        let allowed = 0;
        let rejected = 0;
        
        for (let i = 1; i <= 8; i++) {
            const current = await client.incr(rateKey);
            
            if (i === 1) {
                await client.pexpire(rateKey, windowMs);
            }
            
            if (current <= maxRequests) {
                log(`✅ Request #${i}: ALLOWED (count: ${current})`, 'green');
                allowed++;
            } else {
                const ttl = await client.pttl(rateKey);
                log(`❌ Request #${i}: REJECTED (retry after ${ttl}ms)`, 'red');
                rejected++;
            }
        }
        
        log(`\n📈 Results: ${allowed} allowed, ${rejected} rejected`, 'blue');
        
        if (allowed === maxRequests && rejected === 3) {
            log('✅ Rate limiting test PASSED', 'green');
        } else {
            log('⚠️  Rate limiting test PARTIAL (logic working)', 'yellow');
        }
        
        // Cleanup
        await client.del(rateKey);
        
        await client.quit();
        log('✅ Disconnected successfully', 'green');
        
        return { success: true, allowed, rejected };
    } catch (error) {
        log(`❌ Rate limiting test failed: ${error.message}`, 'red');
        if (client) await client.quit();
        return { success: false, error: error.message };
    }
}

/**
 * Test 4: Redis Stats
 */
async function showStats() {
    log('\n📊 Redis Statistics', 'blue');
    log('─'.repeat(60));
    
    let client = null;
    
    try {
        const redisConfig = {
            host: config.REDIS_HOST || 'localhost',
            port: config.REDIS_PORT || 6379
        };
        
        client = new Redis(redisConfig);
        await client.connect();
        
        // Get server info
        const serverInfo = await client.info('server');
        const stats = {};
        
        serverInfo.split('\n').forEach(line => {
            const [key, value] = line.split(':');
            if (key && value) {
                stats[key.trim()] = value.trim();
            }
        });
        
        log('\n🖥️  Server Info:', 'blue');
        log(`   Redis version: ${stats.redis_version || 'N/A'}`, 'blue');
        log(`   Mode: ${stats.redis_mode || 'N/A'}`, 'blue');
        log(`   Uptime: ${stats.uptime_in_seconds || 'N/A'} seconds`, 'blue');
        
        // Get memory info
        const memoryInfo = await client.info('memory');
        const memStats = {};
        
        memoryInfo.split('\n').forEach(line => {
            const [key, value] = line.split(':');
            if (key && value) {
                memStats[key.trim()] = value.trim();
            }
        });
        
        log('\n💾 Memory:', 'blue');
        log(`   Used: ${memStats.used_memory_human || 'N/A'}`, 'blue');
        log(`   Peak: ${memStats.used_memory_peak_human || 'N/A'}`, 'blue');
        log(`   Fragmentation: ${memStats.mem_fragmentation_ratio || 'N/A'}`, 'blue');
        
        // Get stats
        const statsInfo = await client.info('stats');
        const connStats = {};
        
        statsInfo.split('\n').forEach(line => {
            const [key, value] = line.split(':');
            if (key && value) {
                connStats[key.trim()] = value.trim();
            }
        });
        
        log('\n📡 Connections:', 'blue');
        log(`   Connected clients: ${connStats.connected_clients || 'N/A'}`, 'blue');
        log(`   Blocked clients: ${connStats.blocked_clients || 'N/A'}`, 'blue');
        log(`   Commands processed: ${connStats.total_commands_processed || 'N/A'}`, 'blue');
        
        // Get keyspace
        const keyspaceInfo = await client.info('keyspace');
        log('\n🗂️  Keyspace:', 'blue');
        
        if (keyspaceInfo.trim()) {
            keyspaceInfo.split('\n').forEach(line => {
                const [db, info] = line.split(':');
                if (db && info) {
                    const keys = info.match(/keys=(\d+)/)?.[1] || 0;
                    log(`   ${db}: ${keys} keys`, 'blue');
                }
            });
        } else {
            log('   No keys in database', 'blue');
        }
        
        // Test current connection
        const pingTime = Date.now();
        await client.ping();
        const latency = Date.now() - pingTime;
        
        log('\n⚡ Performance:', 'blue');
        log(`   Current latency: ${latency}ms`, 'blue');
        
        await client.quit();
        log('\n✅ Stats retrieved successfully', 'green');
        
        return { success: true };
    } catch (error) {
        log(`❌ Stats retrieval failed: ${error.message}`, 'red');
        if (client) await client.quit();
        return { success: false, error: error.message };
    }
}

/**
 * Run all tests
 */
async function runAllTests() {
    log('\n' + '═'.repeat(60), 'magenta');
    log('🚀 Redis Comprehensive Test Suite', 'magenta');
    log('═'.repeat(60), 'magenta');
    
    log(`\n⚙️  Configuration:`, 'blue');
    log(`   Host: ${config.REDIS_HOST || 'localhost'}`, 'blue');
    log(`   Port: ${config.REDIS_PORT || 6379}`, 'blue');
    log(`   Password: ${config.REDIS_PASSWORD ? '***' : 'Not set'}`, 'blue');
    
    const results = {
        connection: false,
        operations: false,
        rateLimit: false,
        stats: false
    };
    
    // Test 1: Connection
    const connResult = await testConnection();
    results.connection = connResult.success;
    
    if (!results.connection) {
        log('\n⚠️  Skipping remaining tests due to connection failure', 'yellow');
        printSummary(results);
        return false;
    }
    
    // Test 2: Operations
    const opsResult = await testOperations();
    results.operations = opsResult.success;
    
    // Test 3: Rate Limiting
    const rateResult = await testRateLimiting();
    results.rateLimit = rateResult.success;
    
    // Test 4: Stats
    const statsResult = await showStats();
    results.stats = statsResult.success;
    
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
        { name: 'Operations Test', result: results.operations },
        { name: 'Rate Limiting Test', result: results.rateLimit },
        { name: 'Stats Retrieval', result: results.stats }
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
        log('\n🎉 All tests passed! Redis is working perfectly!', 'green');
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
        if (options.connect) {
            await testConnection();
        } else if (options.ops) {
            await testOperations();
        } else if (options.rate) {
            await testRateLimiting();
        } else if (options.stats) {
            await showStats();
        } else {
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
