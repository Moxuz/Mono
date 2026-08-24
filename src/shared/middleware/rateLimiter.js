const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');
const crypto = require('crypto');
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
let redisInitPromise = null;

// เริ่มต้นเชื่อมต่อ Redis สำหรับใช้เป็น store ของ rate limiter
async function initRedis() {
    if (redisClient && (isRedisReady() || ['connecting', 'connect'].includes(redisClient.status))) {
        return isRedisConnected;
    }

    if (redisInitPromise) return redisInitPromise;

    redisInitPromise = (async () => {
      try {
        const redisConfig = {
            host: config.REDIS_HOST || 'localhost',
            port: config.REDIS_PORT || 6379,
            maxRetriesPerRequest: 1,
            connectTimeout: config.REDIS_CONNECT_TIMEOUT_MS,
            commandTimeout: 2000,   // 2s per command
            retryStrategy: (times) => {
                // Redis is an optional acceleration for local development.
                // A bounded attempt prevents startup from hanging forever when
                // Docker/Redis is unavailable.
                if (times > 1) return null;
                return Math.min(times * 100, 250);
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
        if (redisClient) {
            try { redisClient.disconnect(); } catch (_) { /* best effort */ }
        }
        redisClient = null;
        return false;
      } finally {
        redisInitPromise = null;
      }
    })();

    return redisInitPromise;
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
        try {
            if (redisClient.status === 'ready') await redisClient.quit();
            else redisClient.disconnect();
        } catch (_) { /* best effort during shutdown */ }
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
    // Never interpolate an unvalidated object into a rate-limit key. A
    // NoSQL-injection payload must reach the normal 400 validation path,
    // not make the limiter throw a 500 before validation runs.
    const email = typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : 'invalid-email';
    const ip = getIpFromRequest(req);
    const emailHash = crypto.createHash('sha256').update(email).digest('hex').slice(0, 32);
    return `${ip}_${emailHash}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiters
// ─────────────────────────────────────────────────────────────────────────────

// สร้าง rate limiter middleware โดยใช้ Redis store หรือ memory store เป็น fallback
function createLimiter(options, prefix = 'rl') {
    const whitelistedIPs = config.RATE_LIMIT_WHITELIST || ['127.0.0.1'];

    const makeInstance = (store) => rateLimit({
        validate: { creationStack: false },
        store: store || undefined,
        windowMs: options.windowMs,
        max: options.max,
        // Production startup requires Redis. If it disappears later, do not
        // silently allow unlimited requests or downgrade to a per-process
        // limiter.
        passOnStoreError: false,
        keyGenerator: options.keyGenerator || ((req) => getIpFromRequest(req)),
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
            const ip = getIpFromRequest(req);
            return whitelistedIPs.includes(ip) || Boolean(options.skip?.(req));
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

    // Create immediately at module load time with memory store
    let limiterInstance = makeInstance(null);
    let instanceUsesRedis = false;
    let warnedAboutMemory = false;

    // Return a wrapper middleware; upgrades to Redis store on first request after Redis connects
    return (req, res, next) => {
        if (!instanceUsesRedis && !isRedisReady() && !warnedAboutMemory) {
            warnedAboutMemory = true;
            getLogger().warn(`[RateLimit] ${prefix}: Redis unavailable, using in-memory store`);
        }
        if (!instanceUsesRedis && isRedisReady()) {
            const store = createRedisStore(prefix);
            if (store) {
                limiterInstance = makeInstance(store);
                instanceUsesRedis = true;
                getLogger().info(`[RateLimit] ${prefix}: upgraded to Redis store`);
            }
        }
        limiterInstance(req, res, next);
    };
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

// จำกัดการสมัคร: 5 ครั้ง / 1 ชั่วโมง
const registerLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Too many account creations. Please try again in 1 hour.',
    handler: (req, res) => {
        const SecurityAudit = require('../models/SecurityAudit');
        SecurityAudit.logEvent({
            userId: null,
            action: 'registration_failed',
            status: 'failure',
            ipAddress: getIpFromRequest(req),
            userAgent: req.headers['user-agent'],
            metadata: { reason: 'rate_limit_exceeded', endpoint: '/api/auth/register' }
        }).catch(() => {});
        res.set('Retry-After', 3600);
        res.status(429).json({
            success: false,
            error: 'Too Many Requests',
            message: 'Too many account creations. Please try again in 1 hour.',
            retryAfter: 3600
        });
    }
}, 'register');

// จำกัดการ refresh token: 10 ครั้ง / 15 นาที — keyed by IP.
// Never use an unverified JWT claim as a rate-limit key: an attacker can vary
// the claim and create unlimited buckets from one source IP.
const refreshTokenLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many refresh token requests. Please try again in 15 minutes.'
}, 'refresh-token');

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

// จำกัดการ userinfo: 60 ครั้ง / 1 นาที — keyed by IP.
// Token values are attacker-controlled input and must not create separate
// buckets before authentication has succeeded.
const userinfoLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many userinfo requests. Please try again in 1 minute.'
}, 'userinfo');

// จำกัดการ authorize: 30 ครั้ง / 15 นาที
const authorizeLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many authorization requests. Please try again in 15 minutes.',
    handler: (req, res) => {
        const SecurityAudit = require('../models/SecurityAudit');
        SecurityAudit.logEvent({
            userId: null,
            action: 'rate_limit_exceeded',
            status: 'failure',
            ipAddress: getIpFromRequest(req),
            userAgent: req.headers['user-agent'],
            metadata: { reason: 'too_many_auth_attempts', endpoint: '/api/oauth/authorize' }
        }).catch(() => {});
        res.status(429).json({
            success: false,
            error: 'Too Many Requests',
            message: 'Too many authorization requests. Please try again in 15 minutes.',
            retryAfter: 15 * 60
        });
    }
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

// General protection applies to API traffic. Page loads and static assets are
// deliberately skipped because one browser page can legitimately request
// dozens of files and should not consume the API budget.
const generalLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: config.GENERAL_RATE_LIMIT_MAX,
    skip: (req) => req.method === 'GET' && !req.path.startsWith('/api/'),
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

const tierLimiterCache = new Map();

// สร้าง rate limiter ตาม tier ของ user (free, authenticated, premium, admin)
function createTierLimiter(tier = 'free') {
    if (tierLimiterCache.has(tier)) return tierLimiterCache.get(tier);

    const config = TIER_LIMITS[tier] || TIER_LIMITS.free;

    const limiter = createLimiter({
        windowMs: config.windowMs,
        max: config.max,
        keyGenerator: userIpKeyGenerator,
        message: `Tier ${tier} rate limit exceeded`
    }, `tier:${tier}`);

    tierLimiterCache.set(tier, limiter);
    return limiter;
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
    const customSkip = options.skip;
    return createLimiter({
        ...options,
        skip: (req) => {
            const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0];
            return WHITELISTED_IPS.includes(ip) || Boolean(customSkip?.(req));
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
    refreshTokenLimiter,
    userinfoLimiter,
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
