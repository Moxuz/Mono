
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../swagger.json');
const dashboardRoutes = require('./modules/dashboard/routes/dashboard.routes');
const wellKnownRoutes = require('./modules/auth/routes/wellKnown');




const config = require('./shared/config/config');
const { generalLimiter } = require('./shared/middleware/rateLimiter');
const { csrfProtection, csrfToken } = require('./shared/middleware/csrf');
const { sanitizeBody } = require('./shared/middleware/validate');
const { passport, GOOGLE_ENABLED, GITHUB_ENABLED } = require('./shared/config/passport');

let logger;
try {
    logger = require('./shared/utils/logger');
} catch (e) {
    logger = console;
}

const authRoutes  = require('./modules/auth/routes/auth.routes');
const oauthRoutes = require('./modules/oauth/routes/oauth.routes');
const userRoutes  = require('./modules/user/routes/user.routes');
const sessionRoutes = require('./modules/auth/routes/session.routes');
const socialRoutes = require('./modules/auth/routes/social.routes');

const AuthorizationCode = require('./shared/models/AuthorizationCode');
const TokenBlacklist = require('./shared/models/TokenBlacklist');

const app = express();

// Trust a proxy only when deployment explicitly enables it. This prevents a
// direct local/public app process from accepting a spoofed X-Forwarded-For.
app.set('trust proxy', config.TRUST_PROXY);

// ── Session store ─────────────────────────────────────────────────────────────
// Local development must remain usable without Docker. Production/Docker can
// opt into Redis with USE_REDIS_SESSIONS=true; until it is ready, requests use
// the built-in MemoryStore instead of failing or hanging during startup.
const memorySessionStore = new session.MemoryStore();
let sessionRedisClient = null;
let redisSessionStore = null;
let sessionStoreReady = Promise.resolve(true);

class FallbackSessionStore extends session.Store {
    constructor(memoryStore, redisStore, redisClient) {
        super();
        this.memoryStore = memoryStore;
        this.redisStore = redisStore;
        this.redisClient = redisClient;
    }

    activeStore() {
        return this.redisStore && this.redisClient?.isReady
            ? this.redisStore
            : this.memoryStore;
    }

    get(sid, cb) { return this.activeStore().get(sid, cb); }
    set(sid, sess, cb) { return this.activeStore().set(sid, sess, cb); }
    destroy(sid, cb) { return this.activeStore().destroy(sid, cb); }
    touch(sid, sess, cb) { return this.activeStore().touch(sid, sess, cb); }
    all(cb) { return this.activeStore().all(cb); }
    length(cb) { return this.activeStore().length(cb); }
    clear(cb) { return this.activeStore().clear(cb); }
}

if (config.USE_REDIS_SESSIONS) {
    sessionRedisClient = createClient({
        socket: {
            host: config.REDIS_HOST || 'localhost',
            port: parseInt(config.REDIS_PORT) || 6379,
            connectTimeout: config.REDIS_CONNECT_TIMEOUT_MS,
            reconnectStrategy: (retries) => retries >= 2 ? false : Math.min(retries * 100, 250),
        },
        ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
    });
    sessionRedisClient.on('error', err => logger.warn('Session Redis error:', err.message));
    redisSessionStore = new RedisStore({ client: sessionRedisClient, prefix: 'sess:' });
    sessionStoreReady = sessionRedisClient.connect()
        .then(() => {
            logger.info('Session Redis connected');
            return true;
        })
        .catch(err => {
            logger.warn('Session Redis unavailable; using memory session store:', err.message);
            return false;
        });
} else {
    logger.info('Session store: in-memory (set USE_REDIS_SESSIONS=true to enable Redis)');
}

const sessionStore = new FallbackSessionStore(memorySessionStore, redisSessionStore, sessionRedisClient);
app.locals.sessionStoreReady = sessionStoreReady;

app.locals.closeSessionRedis = async () => {
    if (!sessionRedisClient) return;
    try {
        if (sessionRedisClient.isOpen) await sessionRedisClient.quit();
    } catch (_) {
        try { sessionRedisClient.disconnect(); } catch (_) { /* best effort */ }
    }
};

const helmetDirectives = {
    defaultSrc:  ["'self'"],
    scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net', 'https://cdn.datatables.net'],
    scriptSrcAttr: ["'unsafe-hashes'"],
    styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net', 'https://cdn.datatables.net'],
    styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc:      ["'self'", "data:", "https:", "blob:"],
    connectSrc:  ["'self'", "ws:", "http:", "https:", "wss:"],
    objectSrc:   ["'none'"],
    frameSrc:    ["'none'"],
    baseUri:     ["'self'"],
    formAction:  ["'self'"]
};

// Do not make a local http:// development server upgrade itself to HTTPS.
// Production runs behind TLS and explicitly opts into the directive.
helmetDirectives.upgradeInsecureRequests = config.NODE_ENV === 'production' ? [] : null;

app.use(helmet({
    contentSecurityPolicy: { directives: helmetDirectives },
    hsts: config.NODE_ENV === 'production' ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    } : false,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));

app.use(cors({
    origin: config.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:4000'],
    credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(sanitizeBody);

if (logger.stream) {
    app.use(morgan('combined', { stream: logger.stream }));
} else {
    app.use(morgan('dev'));
}


app.use(session({
    store: sessionStore,
    secret: config.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60,
    }
}));

// Passport must follow immediately after session
app.use(passport.initialize());
app.use(passport.session());

// ตั้งค่า security headers เพิ่มเติมสำหรับทุก request
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
});

app.use(express.static(path.join(__dirname, '../public')));

// ใช้ CSRF protection สำหรับ web routes เท่านั้น (ข้าม API routes)
app.use(csrfToken);
app.use(csrfProtection);

// ตรวจสอบสถานะการทำงานของ server
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.NODE_ENV
    });
});

// API Documentation (Swagger)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Auth API Docs'
}));

// ใช้ rate limit ทั่วไปกับทุก request
app.use(generalLimiter);
app.use('/.well-known', wellKnownRoutes);

// ─── Cleanup Job for Expired Data ─────────────────────────────────────────────
// ตั้งเวลาลบข้อมูลที่หมดอายุทุกคืนเที่ยงคืน
const scheduleCleanup = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);
    const timeUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
        // ลบ authorization codes ที่ถูกใช้แล้ว
        AuthorizationCode.deleteMany({ usedAt: { $ne: null } })
            .then(result => {
                logger.info(`Cleaned up ${result.deletedCount} used authorization codes`);
            })
            .catch(err => {
                logger.error('Failed to cleanup authorization codes:', err);
            });

        // ลบ blacklisted tokens ที่หมดอายุแล้ว
        TokenBlacklist.deleteMany({ expiresAt: { $lt: new Date() } })
            .then(result => {
                logger.info(`Cleaned up ${result.deletedCount} expired blacklisted tokens`);
            })
            .catch(err => {
                logger.error('Failed to cleanup blacklisted tokens:', err);
            });

        scheduleCleanup();
    }, timeUntilMidnight);

    logger.info(`Cleanup scheduled for ${midnight.toLocaleString()}`);
};

// เริ่ม cleanup scheduler เฉพาะ production
if (config.NODE_ENV === 'production') {
    scheduleCleanup();
}

// API Routes
app.use('/api/auth',  authRoutes);

app.use('/api/oauth', oauthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/auth',  socialRoutes);
app.use('/api/dashboard', dashboardRoutes);

// HTML Pages
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, '../public', 'index.html')));
app.get('/login',     (req, res) => res.sendFile(path.join(__dirname, '../public', 'login.html')));
app.get('/register',  (req, res) => res.sendFile(path.join(__dirname, '../public', 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../public', 'dashboard.html')));
app.get('/admin',     (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin.html')));
app.get('/admin/logs',(req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-logs.html')));
app.get('/admin/monitoring',(req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-monitoring.html')));
app.get('/admin/analytics',(req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-analytics.html')));
app.get('/admin/users',(req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-users.html')));
app.get('/user-activity',(req, res) => res.sendFile(path.join(__dirname, '../public', 'user-activity.html')));

// จัดการ route ที่ไม่พบ
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.url} not found`
    });
});

// จัดการ error ทั้งหมดของ application
app.use((err, req, res, next) => {
    logger.error('Error:', {
        message: err.message,
        stack:   err.stack,
        url:     req.url,
        method:  req.method
    });
    const isDevelopment = config.NODE_ENV === 'development';
    const statusCode    = err.statusCode || 500;
    const publicMessage = isDevelopment
        ? (err.message || 'Internal Server Error')
        : (err.publicMessage || 'Internal Server Error');
    res.status(statusCode).json({
        success: false,
        error:   publicMessage,
        ...(isDevelopment && { stack: err.stack })
    });
});

logger.info(`OAuth Status — Google: ${GOOGLE_ENABLED ? 'Enabled' : 'Disabled'} | GitHub: ${GITHUB_ENABLED ? 'Enabled' : 'Disabled'}`);

module.exports = app;
