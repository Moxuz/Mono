const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');
const config = require('../config/config');

// Helper to get IP from request (IPv6 compatible)
const getIpFromRequest = (req) => {
    return req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
};

// ─────────────────────────────────────────────────────────────────────────────
// Redis Connection
// ─────────────────────────────────────────────────────────────────────────────

let redisClient = null;
let isRedisConnected = false;

/**
 * Initialize Redis connection
 * @returns {Promise<boolean>} Connection status
 */
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
                    console.warn('[Redis] Max retries reached, using memory store');
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
            console.log('✅ [Redis] Connected successfully');
            isRedisConnected = true;
        });

        redisClient.on('error', (err) => {
            console.warn('⚠️  [Redis] Connection error:', err.message);
            isRedisConnected = false;
        });

        redisClient.on('close', () => {
            console.warn('⚠️  [Redis] Connection closed');
            isRedisConnected = false;
        });

        redisClient.on('reconnecting', () => {
            console.info('ℹ️  [Redis] Reconnecting...');
        });

        // Connect
        await redisClient.connect();
        
        return isRedisConnected;
    } catch (error) {
        console.warn('⚠️  [Redis] Failed to connect:', error.message);
        console.info('ℹ️  [Redis] Falling back to memory store');
        isRedisConnected = false;
        return false;
    }
}

/**
 * Get Redis client instance
 * @returns {Redis|null}
 */
function getRedisClient() {
    return redisClient;
}

/**
 * Check if Redis is connected
 * @returns {boolean}
 */
function isRedisReady() {
    return isRedisConnected && redisClient?.status === 'ready';
}

/**
 * Close Redis connection
 */
async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        isRedisConnected = false;
        console.info('ℹ️  [Redis] Connection closed');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis Store Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create Redis store for rate limiting
 * @param {string} prefix - Key prefix
 * @returns {Object} RedisStore instance or null
 */
function createRedisStore(prefix = 'rl') {
    if (!isRedisReady() || !redisClient) {
        return null;
    }

    return new RedisStore({
        sendCommand: async (...args) => {
            try {
                return await redisClient.call(...args);
            } catch (error) {
                console.warn('[Redis] Command failed:', error.message);
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

/**
 * Create rate limiter with Redis or memory fallback.
 * Store is resolved lazily on first request so that Redis has time to connect
 * before any limiter tries to use it. If Redis connects after startup the
 * limiter will automatically upgrade from memory → Redis on the next request.
 * @param {Object} options - Rate limit options
 * @param {string} prefix - Redis key prefix
 * @returns {Function} Express middleware
 */
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
                console.info(`[RateLimit] ${prefix}: using Redis store`);
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

// 🔴 Login - 5 req / 15 minutes
const loginLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: emailIpKeyGenerator,
    message: 'Too many login attempts. Please try again in 15 minutes.'
}, 'login');

// 🔴 Register - 3 req / 1 hour
const registerLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many account creations. Please try again in 1 hour.'
}, 'register');

// 🔴 Token - 10 req / 15 minutes
const tokenLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many token requests. Please try again in 15 minutes.'
}, 'token');

// 🔴 Forgot Password - 5 req / 1 hour
const forgotPasswordLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Too many password reset requests. Please try again in 1 hour.'
}, 'forgot-password');

// 🟡 Authorize - 30 req / 15 minutes
const authorizeLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many authorization requests. Please try again in 15 minutes.'
}, 'authorize');

// 🟡 Introspect - 20 req / 15 minutes
const introspectLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many introspection requests. Please try again in 15 minutes.'
}, 'introspect');

// 🟡 Revoke - 20 req / 15 minutes
const revokeLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many revocation requests. Please try again in 15 minutes.'
}, 'revoke');

// 🟢 General - 100 req / 15 minutes
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

/**
 * Create tier-based rate limiter
 * @param {string} tier - User tier (free, authenticated, premium, admin)
 * @returns {Function} Express middleware
 */
function createTierLimiter(tier = 'free') {
    const config = TIER_LIMITS[tier] || TIER_LIMITS.free;
    
    return createLimiter({
        windowMs: config.windowMs,
        max: config.max,
        keyGenerator: userIpKeyGenerator,
        message: `Tier ${tier} rate limit exceeded`
    }, `tier:${tier}`);
}

/**
 * Dynamic tier limiter - automatically detects user tier
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
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

/**
 * Create limiter with IP whitelist
 * @param {Object} options - Rate limit options
 * @returns {Function} Express middleware
 */
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
