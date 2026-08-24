
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
const { authenticate } = require('./modules/auth/middleware/authenticate');
const { authorizeRole } = require('./modules/auth/middleware/authorization');

const AuthorizationCode = require('./shared/models/AuthorizationCode');
const TokenBlacklist = require('./shared/models/TokenBlacklist');
const SecurityAudit = require('./shared/models/SecurityAudit');
const Session = require('./shared/models/Session');
const Consent = require('./shared/models/Consent');
const Client = require('./shared/models/Client');
const User = require('./shared/models/User');

const app = express();

// Trust a proxy only when deployment explicitly enables it. This prevents a
// direct local/public app process from accepting a spoofed X-Forwarded-For.
app.set('trust proxy', config.TRUST_PROXY);

// ── Session store ─────────────────────────────────────────────────────────────
// Local development must remain usable without Docker. Production/Docker uses
// Redis; if Redis disappears after startup, fail session operations closed
// instead of silently creating a second, process-local session store.
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
        if (this.redisStore && this.redisClient?.isReady) return this.redisStore;
        if (config.NODE_ENV === 'production' && config.USE_REDIS_SESSIONS) return null;
        return this.memoryStore;
    }

    unavailable(cb) {
        const error = new Error('Session store unavailable');
        error.code = 'SESSION_STORE_UNAVAILABLE';
        if (typeof cb === 'function') return process.nextTick(() => cb(error));
        throw error;
    }

    get(sid, cb) { const store = this.activeStore(); return store ? store.get(sid, cb) : this.unavailable(cb); }
    set(sid, sess, cb) { const store = this.activeStore(); return store ? store.set(sid, sess, cb) : this.unavailable(cb); }
    destroy(sid, cb) { const store = this.activeStore(); return store ? store.destroy(sid, cb) : this.unavailable(cb); }
    touch(sid, sess, cb) { const store = this.activeStore(); return store ? store.touch(sid, sess, cb) : this.unavailable(cb); }
    all(cb) { const store = this.activeStore(); return store ? store.all(cb) : this.unavailable(cb); }
    length(cb) { const store = this.activeStore(); return store ? store.length(cb) : this.unavailable(cb); }
    clear(cb) { const store = this.activeStore(); return store ? store.clear(cb) : this.unavailable(cb); }
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
    scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net', 'https://cdn.datatables.net', 'https://code.jquery.com'],
    scriptSrcAttr: ["'unsafe-hashes'"],
    styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net', 'https://cdn.datatables.net'],
    styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net', 'https://cdn.datatables.net'],
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

app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: config.REQUEST_BODY_LIMIT }));
app.use(sanitizeBody);

function sanitizedRequestUrl(req) {
    try {
        const parsed = new URL(req.originalUrl || req.url, 'http://localhost');
        const sensitiveParameters = [
            'code',
            'state',
            'token',
            'access_token',
            'refresh_token',
            'id_token',
            'client_secret',
            'password',
            'nonce',
            'code_verifier'
        ];

        for (const parameter of sensitiveParameters) {
            if (parsed.searchParams.has(parameter)) parsed.searchParams.set(parameter, '[REDACTED]');
        }

        const query = parsed.searchParams.toString();
        return `${parsed.pathname}${query ? `?${query}` : ''}`;
    } catch (_) {
        return String(req.originalUrl || req.url || '').split('?')[0];
    }
}

morgan.token('safe-url', sanitizedRequestUrl);

if (logger.stream) {
    const safeAccessLogFormat = ':remote-addr - :remote-user [:date[iso]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';
    app.use(morgan(safeAccessLogFormat, { stream: logger.stream }));
} else {
    app.use(morgan(':method :safe-url :status :response-time ms', { stream: process.stdout }));
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

app.get('/admin.html', authenticate, authorizeRole('admin'), (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin.html')));
app.get('/admin-logs.html', authenticate, authorizeRole('admin'), (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-logs.html')));
app.get('/admin-users.html', authenticate, authorizeRole('admin'), (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-users.html')));

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

// Apply the general budget to API requests; static/page GETs are skipped by
// the limiter so normal browser navigation does not consume it.
app.use(generalLimiter);
app.use('/.well-known', wellKnownRoutes);

// ─── Cleanup Job for Expired Data ─────────────────────────────────────────────
// Keep one lifecycle policy for one-time codes, revoked sessions/consents,
// deactivated clients, anonymized user tombstones, and legacy audit PII.
async function runDataCleanup() {
    const retentionCutoff = new Date(
        Date.now() - config.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    const tasks = [
        ['used authorization codes', () => AuthorizationCode.deleteMany({ usedAt: { $ne: null } })],
        ['expired blacklisted tokens', () => TokenBlacklist.deleteMany({ expiresAt: { $lt: new Date() } })],
        ['inactive sessions', () => Session.cleanupSessions()],
        ['legacy audit identity fields', () => SecurityAudit.scrubLegacyIdentityFields()],
        ['old revoked consents', () => Consent.deleteMany({
            revokedAt: { $ne: null, $lt: retentionCutoff },
            updatedAt: { $lt: retentionCutoff }
        })],
        ['old inactive OAuth clients', () => Client.deleteMany({
            isActive: false,
            updatedAt: { $lt: retentionCutoff }
        })],
        ['expired deleted-user tombstones', () => User.deleteMany({
            isActive: false,
            'pdpaConsent.accountDeletedAt': { $lt: retentionCutoff }
        })]
    ];

    const results = await Promise.allSettled(tasks.map(([, task]) => task()));
    results.forEach((result, index) => {
        const [label] = tasks[index];
        if (result.status === 'fulfilled') {
            const value = typeof result.value === 'number'
                ? result.value
                : result.value?.deletedCount ?? result.value?.modifiedCount ?? 0;
            logger.info(`Cleanup completed: ${label}`, { count: value });
        } else {
            logger.error(`Cleanup failed: ${label}`, result.reason?.message || result.reason);
        }
    });

    return results;
}

app.locals.runDataCleanup = runDataCleanup;

// ตั้งเวลาลบข้อมูลที่หมดอายุทุกคืนเที่ยงคืน
const scheduleCleanup = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);
    const timeUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(async () => {
        await runDataCleanup();
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
app.get('/admin', authenticate, authorizeRole('admin'), (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin.html')));
app.get('/admin/logs', authenticate, authorizeRole('admin'), (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-logs.html')));
app.get('/admin/users', authenticate, authorizeRole('admin'), (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-users.html')));
app.get('/user-activity', authenticate, (req, res) => res.sendFile(path.join(__dirname, '../public', 'user-activity.html')));

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
