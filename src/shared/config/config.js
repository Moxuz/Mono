require('dotenv').config();

module.exports = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 5000,
    BASE_URL: process.env.BASE_URL || 'http://localhost:5000',
    AUTH_SERVER_URL: process.env.AUTH_SERVER_URL || 'http://localhost:5000',

    // Database
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/authdb',

    // JWT
    JWT_SECRET: process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production',
    JWT_EXPIRE: process.env.JWT_EXPIRE || '1h',

    // OAuth
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback',

    // GitHub OAuth
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/api/auth/github/callback',

    // Facebook OAuth
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
    FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:5000/api/auth/facebook/callback',

    // Session
    SESSION_SECRET: process.env.SESSION_SECRET || 'your_session_secret',

    // CORS
    CORS_ORIGIN: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:4000'],

    // Rate Limiting
    RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_WHITELIST: process.env.RATE_LIMIT_WHITELIST ? process.env.RATE_LIMIT_WHITELIST.split(',') : [],

    // Redis
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || null,

    // Kafka
    USE_KAFKA_LOGGING: process.env.USE_KAFKA_LOGGING === 'true',
    KAFKA_BROKER: process.env.KAFKA_BROKER || 'localhost:9092',
    KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'auth-app',

    email: {
        smtp: {
            host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        fromName:    process.env.EMAIL_FROM_NAME    || 'ShopHub Auth',
        fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@shophub.com',
    },
};