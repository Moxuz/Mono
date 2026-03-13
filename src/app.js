const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
// ❌ ลบบรรทัดนี้ออก: const passport = require('passport');
const wellKnownRoutes = require('./modules/auth/routes/wellKnown');
const emailService = require('./shared/services/email.service');

const config = require('./shared/config/config');
const connectDB = require('./shared/utils/database');
const { generalLimiter } = require('./shared/middleware/rateLimiter'); // ⭐ เพิ่ม

let logger;
try {
    logger = require('./shared/utils/logger');
} catch (e) {
    logger = console;
}

const authRoutes  = require('./modules/auth/routes/auth.routes');
const oauthRoutes = require('./modules/oauth/routes/oauth.routes');
const userRoutes  = require('./modules/user/routes/user.routes');

const app = express();

connectDB().catch(err => {
    logger.error('Database connection failed:', err);
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc:    ["'self'", "'unsafe-inline'"],
            imgSrc:      ["'self'", "data:", "https:"],
            connectSrc:  ["'self'", "ws:", "http:", "https:"],
            fontSrc:     ["'self'", "https:", "data:"],
            objectSrc:   ["'none'"],
        },
    },
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

// Health check (ไม่มี rate limit)
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.NODE_ENV
    });
});

// General rate limit ครอบทุก route
app.use(generalLimiter);
app.use('/.well-known', wellKnownRoutes);
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth',  authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/users', userRoutes);

// HTML Pages
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, '../public', 'index.html')));
app.get('/login',     (req, res) => res.sendFile(path.join(__dirname, '../public', 'login.html')));
app.get('/register',  (req, res) => res.sendFile(path.join(__dirname, '../public', 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../public', 'dashboard.html')));

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

module.exports = app;