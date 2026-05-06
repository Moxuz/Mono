/**
 * CSRF Protection Middleware
 * Generates and validates CSRF tokens for form submissions
 */

const crypto = require('crypto');

// Store tokens temporarily (in production, use Redis)
const csrfTokens = new Map();

/**
 * Generate CSRF token
 * @param {string} userId - User ID to associate token with
 * @returns {string} CSRF token
 */
function generateCSRFToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 3600000; // 1 hour
    
    csrfTokens.set(token, { userId, expiresAt });
    
    // Clean up expired tokens
    setTimeout(() => {
        csrfTokens.delete(token);
    }, 3600000);
    
    return token;
}

/**
 * Validate CSRF token
 * @param {string} token - Token to validate
 * @param {string} userId - User ID to check against
 * @returns {boolean} True if valid
 */
function validateCSRFToken(token, userId) {
    if (!token || !userId) {
        return false;
    }
    
    const tokenData = csrfTokens.get(token);
    
    if (!tokenData) {
        return false;
    }
    
    if (tokenData.expiresAt < Date.now()) {
        csrfTokens.delete(token);
        return false;
    }
    
    if (tokenData.userId !== userId) {
        return false;
    }
    
    return true;
}

/**
 * CSRF protection middleware
 * Validates CSRF token on state-changing requests
 */
function csrfProtection(req, res, next) {
    // Skip for GET requests and API endpoints
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    
    // Skip API routes (they use JWT)
    if (req.path.startsWith('/api/')) {
        return next();
    }
    
    // For form submissions, validate CSRF token
    const token = req.body._csrf || req.headers['x-csrf-token'];
    const userId = req.user?.id || req.session?.userId;
    
    if (!validateCSRFToken(token, userId)) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token missing or invalid',
            message: 'Please refresh the page and try again'
        });
    }
    
    next();
}

/**
 * Middleware to add CSRF token to response locals
 */
function csrfToken(req, res, next) {
    const userId = req.user?.id || req.session?.userId;
    
    if (userId) {
        res.locals.csrfToken = generateCSRFToken(userId);
    }
    
    next();
}

// Clean up old tokens periodically
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of csrfTokens.entries()) {
        if (data.expiresAt < now) {
            csrfTokens.delete(token);
        }
    }
}, 3600000); // Every hour

module.exports = {
    generateCSRFToken,
    validateCSRFToken,
    csrfProtection,
    csrfToken
};
