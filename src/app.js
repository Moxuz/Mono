const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const passport = require('passport');

const config = require('./shared/config/config');
const connectDB = require('./shared/utils/database');

// Import logger (with fallback)
let logger;
try {
    logger = require('./shared/utils/logger');
} catch (e) {
    logger = console;
}

// Import routes
const authRoutes = require('./modules/auth/routes/auth.routes');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB().catch(err => {
    logger.error('Database connection failed:', err);
});

// Passport configuration (optional - comment out if not using)
// require('./shared/config/passport')(passport);

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
    origin: config.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:4000'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Morgan logger
if (logger.stream) {
    app.use(morgan('combined', { stream: logger.stream }));
} else {
    app.use(morgan('dev'));
}

// Session configuration
app.use(session({
    secret: config.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60, // 1 hour
    }
}));

// Passport middleware (comment out if not using)
// app.use(passport.initialize());
// app.use(passport.session());

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.NODE_ENV
    });
});

// API Routes
app.use('/api/auth', authRoutes);

// Legacy routes (backward compatibility)
app.use('/auth', authRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
    res.send('<h1>Auth Monolith API</h1><p>Server is running!</p>');
});

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
        stack: err.stack,
        url: req.url,
        method: req.method
    });

    res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Server Error',
        ...(config.NODE_ENV === 'development' && { stack: err.stack })
    });
});

module.exports = app;