const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');
const config = require('../config/config');

// Lazy logger reference to avoid circular dependency at module load time
let logger;
function getLogger() {
    if (!logger) {
        try { logger = require('../utils/logger'); } catch { logger = console; }
    }
    return logger;
}

// Helper to get IP from request (IPv6 compatible)
const getIpFromRequest = (req) => {
    return req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
};

// ─────────────────────────────────────────────────────────────────────────────
// Redis Connection
// ─────────────────────────────────────────────────────────────────────────────

let redisClient = null;
let isRedisConnected = false;

// เริ่มต้นเชื่อมต่อ Redis สำหรับใช้เป็น store ของ rate limiter
async function initRedis() {
    if (redisClient) {
        return isRedisConnected;
    }

    try {
        const redisConfig = {
            host: config.REDIS_HOST || 'localhost',
            port: config.REDIS_PORT || 6379,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 5) {
                    getLogger().warn('[Redis] Max retries reached, using memory store');
                    return null; // Stop retrying
                }
                return Math.min(times * 100, 2000);
            },
            lazyConnect: true
        };

        // Add password if provided
        if (config.REDIS_PASSWORD) {
            redisConfig.password = config.REDIS_PASSWORD;
        }

        redisClient = new Redis(redisConfig);

        redisClient.on('connect', () => {
            getLogger().info('[Redis] Connected successfully');
            isRedisConnected = true;
        });

        redisClient.on('error', (err) => {
            getLogger().warn('[Redis] Connection error:', err.message);
            isRedisConnected = false;
        });

        redisClient.on('close', () => {
            getLogger().warn('[Redis] Connection closed');
            isRedisConnected = false;
        });

        redisClient.on('reconnecting', () => {
            getLogger().info('[Redis] Reconnecting...');
        });

        // Connect
        await redisClient.connect();
        
        return isRedisConnected;
    } catch (error) {
        getLogger().warn('[Redis] Failed to connect:', error.message);
        getLogger().info('[Redis] Falling back to memory store');
        isRedisConnected = false;
        return false;
    }
}

// คืนค่า Redis client instance ปัจจุบัน
function getRedisClient() {
    return redisClient;
}

// ตรวจสอบว่า Redis เชื่อมต่อและพร้อมใช้งานหรือไม่
function isRedisReady() {
    return isRedisConnected && redisClient?.status === 'ready';
}

/**
 * Close Redis connection
 */
// ปิดการเชื่อมต่อ Redis
async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        isRedisConnected = false;
        getLogger().info('[Redis] Connection closed');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis Store Factory
// ─────────────────────────────────────────────────────────────────────────────

// สร้าง RedisStore สำหรับ rate limiter โดยใช้ prefix กำหนด namespace
function createRedisStore(prefix = 'rl') {
    if (!isRedisReady() || !redisClient) {
        return null;
    }

    return new RedisStore({
        sendCommand: async (...args) => {
            try {
                return await redisClient.call(...args);
            } catch (error) {
                getLogger().warn('[Redis] Command failed:', error.message);
                throw error;
            }
        },
        prefix: `${prefix}:`
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate key from IP and User ID
 * @param {Object} req - Express request
 * @returns {string}
 */
const userIpKeyGenerator = (req) => {
    const userId = req.user?.id || 'anon';
    const ip = getIpFromRequest(req);
    return `${userId}_${ip}`;
};

/**
 * Generate key from IP and email
 * @param {Object} req - Express request
 * @returns {string}
 */
const emailIpKeyGenerator = (req) => {
    const email = req.body?.email || 'no-email';
    const ip = getIpFromRequest(req);
    return `${ip}_${email}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiters
// ─────────────────────────────────────────────────────────────────────────────

// สร้าง rate limiter middleware โดยใช้ Redis store หรือ memory store เป็น fallback
function createLimiter(options, prefix = 'rl') {
    const whitelistedIPs = config.RATE_LIMIT_WHITELIST || ['127.0.0.1'];

    // Cached limiter instance and whether it was created with Redis
    let limiterInstance = null;
    let instanceUsesRedis = false;

    function getLimiter() {
        const redisNowReady = isRedisReady();

        // (Re)create limiter when: first call, or Redis just became available
        if (!limiterInstance || (redisNowReady && !instanceUsesRedis)) {
            const store = redisNowReady ? createRedisStore(prefix) : null;
            instanceUsesRedis = !!store;

            limiterInstance = rateLimit({
                store: store || undefined,
                windowMs: options.windowMs,
                max: options.max,
                keyGenerator: options.keyGenerator || ((req) => getIpFromRequest(req)),
                standardHeaders: true,
                legacyHeaders: false,
                skip: (req) => {
                    const ip = getIpFromRequest(req);
                    return whitelistedIPs.includes(ip);
                },
                handler: options.handler || ((req, res) => {
                    res.status(429).json({
                        success: false,
                        error: 'Too Many Requests',
                        message: options.message || 'Too many requests, please try again later',
                        retryAfter: Math.round(options.windowMs / 1000)
                    });
                })
            });

            if (store) {
                getLogger().info(`[RateLimit] ${prefix}: using Redis store`);
            }
        }

        return limiterInstance;
    }

    // Return a wrapper middleware that resolves the real limiter on each request
    return (req, res, next) => getLimiter()(req, res, next);
}

// ─────────────────────────────────────────────────────────────────────────────
// Specific Limiters
// ─────────────────────────────────────────────────────────────────────────────

// จำกัดการ login: 5 ครั้ง / 15 นาที
const loginLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: emailIpKeyGenerator,
    message: 'Too many login attempts. Please try again in 15 minutes.'
}, 'login');

// จำกัดการสมัคร: 3 ครั้ง / 1 ชั่วโมง
const registerLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many account creations. Please try again in 1 hour.'
}, 'register');

// จำกัดการขอ token: 10 ครั้ง / 15 นาที
const tokenLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many token requests. Please try again in 15 minutes.'
}, 'token');

// จำกัดการขอรีเซ็ตรหัสผ่าน: 5 ครั้ง / 1 ชั่วโมง
const forgotPasswordLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Too many password reset requests. Please try again in 1 hour.'
}, 'forgot-password');

// จำกัดการ authorize: 30 ครั้ง / 15 นาที
const authorizeLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many authorization requests. Please try again in 15 minutes.'
}, 'authorize');

// จำกัดการ introspect token: 20 ครั้ง / 15 นาที
const introspectLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many introspection requests. Please try again in 15 minutes.'
}, 'introspect');

// จำกัดการ revoke token: 20 ครั้ง / 15 นาที
const revokeLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many revocation requests. Please try again in 15 minutes.'
}, 'revoke');

// จำกัด request ทั่วไป: 100 ครั้ง / 15 นาที
const generalLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests. Please try again in 15 minutes.'
}, 'general');

// ─────────────────────────────────────────────────────────────────────────────
// User Tier System (Premium Support)
// ─────────────────────────────────────────────────────────────────────────────

const TIER_LIMITS = {
    free: { max: 100, windowMs: 15 * 60 * 1000 },
    authenticated: { max: 500, windowMs: 15 * 60 * 1000 },
    premium: { max: 2000, windowMs: 15 * 60 * 1000 },
    admin: { max: 10000, windowMs: 15 * 60 * 1000 }
};

// สร้าง rate limiter ตาม tier ของ user (free, authenticated, premium, admin)
function createTierLimiter(tier = 'free') {
    const config = TIER_LIMITS[tier] || TIER_LIMITS.free;
    
    return createLimiter({
        windowMs: config.windowMs,
        max: config.max,
        keyGenerator: userIpKeyGenerator,
        message: `Tier ${tier} rate limit exceeded`
    }, `tier:${tier}`);
}

// ตรวจจับ tier ของ user อัตโนมัติและใช้ rate limit ที่เหมาะสม
function dynamicTierLimiter(req, res, next) {
    const tier = req.user?.role === 'admin' ? 'admin'
        : req.user?.subscription === 'premium' ? 'premium'
        : req.user ? 'authenticated' : 'free';

    const limiter = createTierLimiter(tier);
    limiter(req, res, next);
}

// ─────────────────────────────────────────────────────────────────────────────
// IP Whitelist
// ─────────────────────────────────────────────────────────────────────────────

const WHITELISTED_IPS = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];

// สร้าง rate limiter พร้อม IP whitelist สำหรับข้าม limit
function createWhitelistedLimiter(options) {
    return createLimiter({
        ...options,
        skip: (req) => {
            const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0];
            return WHITELISTED_IPS.includes(ip);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    // Initialize Redis
    initRedis,
    getRedisClient,
    isRedisReady,
    closeRedis,
    
    // Standard limiters
    loginLimiter,
    registerLimiter,
    tokenLimiter,
    forgotPasswordLimiter,
    authorizeLimiter,
    introspectLimiter,
    revokeLimiter,
    generalLimiter,
    
    // Advanced features
    createTierLimiter,
    dynamicTierLimiter,
    createWhitelistedLimiter,
    
    // Utilities
    userIpKeyGenerator,
    emailIpKeyGenerator,
    TIER_LIMITS
};
