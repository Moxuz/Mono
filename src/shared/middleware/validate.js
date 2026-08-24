/**
 * Lightweight request validation middleware (no external deps)
 * Usage: validate(rules) returns an Express middleware
 *
 * Rule keys map to req.body field names.
 * Rule values are objects: { required, type, minLen, maxLen, match, enum: [...] }
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,63}$/;
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}._-]{2,63}$/u;
const MAX_SANITIZE_DEPTH = 20;
const MAX_SANITIZE_ARRAY_ITEMS = 100;
const MAX_SANITIZE_OBJECT_KEYS = 200;

/**
 * Build a validation middleware from a rules object.
 * @param {Object} rules  e.g. { email: { required: true, type: 'email' }, username: { required: true, minLen: 3, maxLen: 30 } }
 */
function validate(rules) {
    return (req, res, next) => {
        const errors = [];

        for (const [field, rule] of Object.entries(rules)) {
            const value = req.body[field];
            const isEmpty = value === undefined || value === null || value === '' ||
                (typeof value === 'string' && value.trim() === '');

            if (rule.required && isEmpty) {
                errors.push(`${field} is required`);
                continue;
            }

            if (isEmpty) continue; // optional field not provided — skip remaining checks

            if (rule.type === 'boolean') {
                if (typeof value !== 'boolean') errors.push(`${field} must be a boolean`);
                continue;
            }

            if (rule.type === 'array') {
                if (!Array.isArray(value)) {
                    errors.push(`${field} must be an array`);
                    continue;
                }
                if (rule.minItems !== undefined && value.length < rule.minItems) {
                    errors.push(`${field} must contain at least ${rule.minItems} item(s)`);
                }
                if (rule.maxItems !== undefined && value.length > rule.maxItems) {
                    errors.push(`${field} must contain at most ${rule.maxItems} item(s)`);
                }
                continue;
            }

            const expectsString = rule.type === 'string' || rule.type === 'email' ||
                rule.minLen !== undefined || rule.maxLen !== undefined || rule.match instanceof RegExp;
            if (expectsString && typeof value !== 'string') {
                errors.push(`${field} must be a string`);
                continue;
            }

            // Non-string objects (e.g., after NoSQL injection stripping) are invalid
            if (typeof value === 'object') {
                errors.push(`${field} must be a string`);
                continue;
            }

            const strVal = String(value);

            if (rule.type === 'email' && !EMAIL_RE.test(strVal)) {
                errors.push(`${field} must be a valid email address`);
            }

            if (rule.minLen !== undefined && strVal.length < rule.minLen) {
                errors.push(`${field} must be at least ${rule.minLen} characters`);
            }

            if (rule.maxLen !== undefined && strVal.length > rule.maxLen) {
                errors.push(`${field} must be at most ${rule.maxLen} characters`);
            }

            if (rule.match instanceof RegExp && !rule.match.test(strVal)) {
                errors.push(`${field} has an invalid format`);
            }

            if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
                errors.push(`${field} must be one of: ${rule.enum.join(', ')}`);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
        }

        next();
    };
}

/**
 * Strip MongoDB query operators ($gt, $where, etc.) from req.body to prevent NoSQL injection.
 * Applied globally in app.js.
 */
function sanitizeBody(req, res, next) {
    try {
        if (req.body && typeof req.body === 'object') {
            req.body = stripOperators(req.body);
        }
    } catch (error) {
        return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: [error.message]
        });
    }
    next();
}

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function stripOperators(obj, depth = 0) {
    if (depth > MAX_SANITIZE_DEPTH) {
        throw new Error(`Request body nesting cannot exceed ${MAX_SANITIZE_DEPTH} levels`);
    }
    if (Array.isArray(obj)) {
        if (obj.length > MAX_SANITIZE_ARRAY_ITEMS) {
            throw new Error(`Request body arrays cannot contain more than ${MAX_SANITIZE_ARRAY_ITEMS} items`);
        }
        return obj.map(value => stripOperators(value, depth + 1));
    }
    if (obj !== null && typeof obj === 'object') {
        const entries = Object.entries(obj);
        if (entries.length > MAX_SANITIZE_OBJECT_KEYS) {
            throw new Error(`Request body objects cannot contain more than ${MAX_SANITIZE_OBJECT_KEYS} fields`);
        }
        const clean = Object.create(null);
        for (const [k, v] of entries) {
            if (k.startsWith('$') || BLOCKED_KEYS.has(k)) continue; // drop operator + prototype keys
            clean[k] = stripOperators(v, depth + 1);
        }
        return clean;
    }
    return obj;
}

// Pre-built rule sets for common routes
const rules = {
    register: {
        username: { required: true, minLen: 3, maxLen: 64, match: USERNAME_RE },
        email:    { required: true, type: 'email', maxLen: 254 },
        password: { required: true, minLen: 8, maxLen: 128 },
        consentEssential: { required: true, type: 'boolean' },
        consentAnalytics: { type: 'boolean' },
    },
    login: {
        email:    { required: true, type: 'email', maxLen: 254 },
        password: { required: true, minLen: 1, maxLen: 128 },
        remember: { type: 'boolean' },
    },
    forgotPassword: {
        email: { required: true, type: 'email', maxLen: 254 },
    },
    resetPassword: {
        password: { required: true, minLen: 8, maxLen: 128 },
    },
    changePassword: {
        currentPassword: { required: true, minLen: 1, maxLen: 128 },
        newPassword:     { required: true, minLen: 8, maxLen: 128 },
    },
    setPassword: {
        newPassword:     { required: true, minLen: 8, maxLen: 128 },
    },
    registerClient: {
        client_name:   { required: true, minLen: 1, maxLen: 100 },
        description:    { type: 'string', maxLen: 500 },
        logo_uri:       { type: 'string', maxLen: 2048 },
        contact_email: { required: true, type: 'email', maxLen: 254 },
        redirect_uris: { required: true, type: 'array', minItems: 1, maxItems: 10 },
        application_type: { enum: ['web'] },
        scope: { type: 'string', maxLen: 500 },
    },
    updateClient: {
        client_name:   { minLen: 1, maxLen: 100 },
        description:    { type: 'string', maxLen: 500 },
        logo_uri:       { type: 'string', maxLen: 2048 },
        contact_email: { type: 'email', maxLen: 254 },
        redirect_uris: { type: 'array', minItems: 1, maxItems: 10 },
    },
    profile: {
        displayName:{ maxLen: 80 },
        bio:        { maxLen: 160 },
    },
    userUpdate: {
        username: { minLen: 3, maxLen: 64, match: USERNAME_RE },
        email:    { type: 'email', maxLen: 254 },
    },
};

module.exports = { validate, sanitizeBody, rules };
