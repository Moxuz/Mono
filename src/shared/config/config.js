require('dotenv').config();

function boundedInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min) return fallback;
    return Math.min(parsed, max);
}

const requiredEnv = ['JWT_SECRET', 'SESSION_SECRET'];
if (process.env.NODE_ENV === 'production' && !process.env.OIDC_PRIVATE_KEY) {
    requiredEnv.push('OIDC_PRIVATE_KEY');
}
const missing = requiredEnv.filter(k => !process.env[k]);
if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

if (process.env.NODE_ENV === 'production') {
    const weakSecrets = ['JWT_SECRET', 'SESSION_SECRET']
        .filter(key => String(process.env[key] || '').length < 32);
    if (weakSecrets.length) {
        throw new Error(`Production secrets must be at least 32 characters: ${weakSecrets.join(', ')}`);
    }
    if (process.env.JWT_SECRET === process.env.SESSION_SECRET) {
        throw new Error('JWT_SECRET and SESSION_SECRET must be different in production');
    }
}

module.exports = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 5000,
    BASE_URL: process.env.BASE_URL || 'http://localhost:5000',
    AUTH_SERVER_URL: process.env.AUTH_SERVER_URL || 'http://localhost:5000',
    TRUST_PROXY: process.env.TRUST_PROXY === undefined
        ? (process.env.NODE_ENV === 'production' ? 1 : false)
        : (process.env.TRUST_PROXY === 'true' ? 1 : (Number.isFinite(Number(process.env.TRUST_PROXY)) ? Number(process.env.TRUST_PROXY) : false)),

    // Database
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/authdb',
    MONGO_SERVER_SELECTION_TIMEOUT_MS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 10) || 3000,
    MONGO_CONNECT_TIMEOUT_MS: parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS, 10) || 3000,

    // JWT
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRE: process.env.JWT_EXPIRE || '1h',

    // OAuth
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    // GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback',
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',

    // GitHub OAuth
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/api/auth/github/callback',

    // Session
    SESSION_SECRET: process.env.SESSION_SECRET,
    USE_REDIS_SESSIONS: process.env.USE_REDIS_SESSIONS === 'true' || process.env.NODE_ENV === 'production',
    MAX_ACTIVE_SESSIONS: boundedInt(process.env.MAX_ACTIVE_SESSIONS, 5, 1, 50),

    // Request/resource limits
    REQUEST_BODY_LIMIT: process.env.REQUEST_BODY_LIMIT || '10kb',
    ADMIN_QUERY_LIMIT: boundedInt(process.env.ADMIN_QUERY_LIMIT, 1000, 100, 10000),

    // CORS
    CORS_ORIGIN: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:4000'],

    // Rate Limiting
    RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX: boundedInt(process.env.GENERAL_RATE_LIMIT_MAX, 500, 1, 10000),
    // General API budget. Static/page GET requests are skipped by the
    // general limiter; sensitive endpoints keep their smaller dedicated caps.
    GENERAL_RATE_LIMIT_MAX: boundedInt(process.env.GENERAL_RATE_LIMIT_MAX, 500, 1, 10000),
    RATE_LIMIT_WHITELIST: process.env.RATE_LIMIT_WHITELIST
        ? process.env.RATE_LIMIT_WHITELIST.split(',').map(ip => ip.trim()).filter(Boolean)
        : ['127.0.0.1', '::1', '::ffff:127.0.0.1'],

    // Data lifecycle
    DATA_RETENTION_DAYS: Math.max(30, parseInt(process.env.DATA_RETENTION_DAYS, 10) || 90),

    // Redis
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || null,
    REDIS_CONNECT_TIMEOUT_MS: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 10) || 1500,
    REDIS_REQUIRED: process.env.REDIS_REQUIRED === 'true' || process.env.NODE_ENV === 'production',

    // Kafka
    USE_KAFKA_LOGGING: process.env.USE_KAFKA_LOGGING === 'true',
    KAFKA_BROKER: process.env.KAFKA_BROKER || process.env.KAFKA_BROKERS || 'localhost:9092',
    KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'auth-app',
    KAFKA_CONNECT_TIMEOUT_MS: parseInt(process.env.KAFKA_CONNECT_TIMEOUT_MS, 10) || 2000,
    KAFKA_RETRIES: boundedInt(process.env.KAFKA_RETRIES, 0, 0, 10),

    // OIDC signing keys. In development an ephemeral RSA key is generated so
    // the application can run without Docker-managed secrets. Production
    // requires OIDC_PRIVATE_KEY so ID tokens remain verifiable after restart.
    OIDC_PRIVATE_KEY: process.env.OIDC_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    OIDC_PUBLIC_KEY: process.env.OIDC_PUBLIC_KEY?.replace(/\\n/g, '\n'),
    OIDC_KEY_ID: process.env.OIDC_KEY_ID || 'authsys-1',

    email: {
        smtp: {
            host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        fromName: process.env.EMAIL_FROM_NAME || process.env.SMTP_FROM_NAME || 'ShopHub Auth',
        fromAddress: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_FROM_EMAIL || 'noreply@shophub.com',
        verifyTimeoutMs: parseInt(process.env.SMTP_VERIFY_TIMEOUT_MS, 10) || 2500,
    },
};
