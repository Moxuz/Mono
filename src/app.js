
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../swagger.json');
const dashboardRoutes = require('./modules/dashboard/routes/dashboard.routes');
const wellKnownRoutes = require('./modules/auth/routes/wellKnown');




const config = require('./shared/config/config');
const connectDB = require('./shared/utils/database');
const { generalLimiter } = require('./shared/middleware/rateLimiter');
const { csrfProtection, csrfToken } = require('./shared/middleware/csrf');
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

connectDB().catch(err => {
    logger.error('Database connection failed:', err);
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net', 'https://cdn.datatables.net'],
            scriptSrcAttr: ["'unsafe-hashes'"],
            styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net', 'https://cdn.datatables.net'], // ✅ เพิ่ม Google Fonts
            styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // ✅ เพิ่ม Google Fonts (สำหรับ <link>)
            fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'data:'], // ✅ เพิ่ม Google Fonts (สำหรับ font files)
            imgSrc:      ["'self'", "data:", "https:", "blob:"],
            connectSrc:  ["'self'", "ws:", "http:", "https:", "wss:"],
            objectSrc:   ["'none'"],
            frameSrc:    ["'none'"],
            baseUri:     ["'self'"],
            formAction:  ["'self'"],
            upgradeInsecureRequests: []
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    noSniff: {},
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));

app.use(cors({
    origin: config.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:4000'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (logger.stream) {
    app.use(morgan('combined', { stream: logger.stream }));
} else {
    app.use(morgan('dev'));
}


app.use(session({
    secret: config.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60,
    }
}));

app.use(express.static(path.join(__dirname, '../public')));

// ✅ ลบ duplicate CSP headers (helmet จัดการให้แล้ว)
// Security Headers Middleware (applied to all routes)
app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Enable XSS filter
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Control referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // ❌ ลบบรรทัดนี้ออก (duplicate - helmet จัดการแล้ว)
    // res.setHeader('Content-Security-Policy', "default-src 'self'");

    // Permissions Policy
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    next();
});

// CSRF Protection for web routes ONLY (skip API routes)
app.use(csrfToken);
app.use(csrfProtection);

// Health check
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

app.use(passport.initialize());
app.use(passport.session());

// General rate limit
app.use(generalLimiter);
app.use('/.well-known', wellKnownRoutes);

// ─── Cleanup Job for Expired Data ─────────────────────────────────────────────
const scheduleCleanup = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timeUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
        // Cleanup used authorization codes
        AuthorizationCode.deleteMany({ used: true })
            .then(result => {
                logger.info(`🧹 Cleaned up ${result.deletedCount} used authorization codes`);
            })
            .catch(err => {
                logger.error('Failed to cleanup authorization codes:', err);
            });

        // Cleanup expired tokens from blacklist
        TokenBlacklist.deleteMany({ expiresAt: { $lt: new Date() } })
            .then(result => {
                logger.info(`🧹 Cleaned up ${result.deletedCount} expired blacklisted tokens`);
            })
            .catch(err => {
                logger.error('Failed to cleanup blacklisted tokens:', err);
            });

        // Schedule next cleanup
        scheduleCleanup();
    }, timeUntilMidnight);

    logger.info(`🕐 Cleanup scheduled for ${midnight.toLocaleString()}`);
};

// Start cleanup scheduler
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
app.get('/user-activity',(req, res) => res.sendFile(path.join(__dirname, '../public', 'user-activity.html')));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.url} not found`
    });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error('Error:', {
        message: err.message,
        stack:   err.stack,
        url:     req.url,
        method:  req.method
    });
    const isDevelopment = config.NODE_ENV === 'development';
    const statusCode    = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        error:   err.message || 'Internal Server Error',
        ...(isDevelopment && { stack: err.stack })
    });
});

console.log('🔍 OAuth Status:');
console.log('  Google:', GOOGLE_ENABLED ? '✅ Enabled' : '❌ Disabled');
console.log('  GitHub:', GITHUB_ENABLED ? '✅ Enabled' : '❌ Disabled');

console.log('📋 Loaded Strategies:', Object.keys(passport._strategies));

module.exports = app;