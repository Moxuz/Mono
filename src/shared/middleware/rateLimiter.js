const rateLimit = require('express-rate-limit');

const { ipKeyGenerator } = require('express-rate-limit');

// Helper: response format มาตรฐาน
const createLimitHandler = (message, windowMinutes = 15) => (req, res) => {
    res.status(429).json({
        success: false,
        error: 'Too Many Requests',
         message: `${message}<br>กรุณาลองใหม่ใน ${windowMinutes} นาที`,
        retryAfter: windowMinutes * 60,
    });
};

// 🔴 Login - 5 req / 15 นาที
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req)}_${req.body?.email || ''}`,
    handler: createLimitHandler('ลองเข้าสู่ระบบหลายครั้งเกินไป', 15),
});

// 🔴 Register - 3 req / 1 ชั่วโมง
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createLimitHandler('สร้างบัญชีหลายครั้งเกินไป', 60),
});

// 🔴 Token - 10 req / 15 นาที
const tokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createLimitHandler('Token request มากเกินไป', 15),
});

// 🔴 Forgot Password - 5 req / 1 ชั่วโมง
const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createLimitHandler('ขอรีเซ็ตรหัสผ่านหลายครั้งเกินไป', 60),
});

// 🟡 Authorize - 30 req / 15 นาที
const authorizeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createLimitHandler('Authorization request มากเกินไป', 15),
});

// 🟡 Introspect - 20 req / 15 นาที
const introspectLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createLimitHandler('Introspect request มากเกินไป', 15),
});

// 🟡 Revoke - 20 req / 15 นาที
const revokeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createLimitHandler('Revoke request มากเกินไป', 15),
});

// 🟢 General - 100 req / 15 นาที
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createLimitHandler('Request มากเกินไป', 15),
});
module.exports = {
    loginLimiter,
    registerLimiter,
    tokenLimiter,
    forgotPasswordLimiter,
    authorizeLimiter,
    introspectLimiter,
    revokeLimiter,
    generalLimiter,
};
