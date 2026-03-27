/**
 * Lightweight request validation middleware (no external deps)
 * Usage: validate(rules) returns an Express middleware
 *
 * Rule keys map to req.body field names.
 * Rule values are objects: { required, type, minLen, maxLen, match, enum: [...] }
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Build a validation middleware from a rules object.
 * @param {Object} rules  e.g. { email: { required: true, type: 'email' }, username: { required: true, minLen: 3, maxLen: 30 } }
 */
function validate(rules) {
    return (req, res, next) => {
        const errors = [];

        for (const [field, rule] of Object.entries(rules)) {
            const value = req.body[field];
            const isEmpty = value === undefined || value === null || value === '';

            if (rule.required && isEmpty) {
                errors.push(`${field} is required`);
                continue;
            }

            if (isEmpty) continue; // optional field not provided — skip remaining checks

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
    if (req.body && typeof req.body === 'object') {
        req.body = stripOperators(req.body);
    }
    next();
}

function stripOperators(obj) {
    if (Array.isArray(obj)) return obj.map(stripOperators);
    if (obj !== null && typeof obj === 'object') {
        const clean = {};
        for (const [k, v] of Object.entries(obj)) {
            if (k.startsWith('$')) continue; // drop operator keys
            clean[k] = stripOperators(v);
        }
        return clean;
    }
    return obj;
}

// Pre-built rule sets for common routes
const rules = {
    register: {
        username: { required: true, minLen: 3, maxLen: 30 },
        email:    { required: true, type: 'email' },
        password: { required: true, minLen: 8, maxLen: 128 },
    },
    login: {
        email:    { required: true, type: 'email' },
        password: { required: true, minLen: 1, maxLen: 128 },
    },
    forgotPassword: {
        email: { required: true, type: 'email' },
    },
    resetPassword: {
        password: { required: true, minLen: 8, maxLen: 128 },
    },
    changePassword: {
        currentPassword: { required: true, minLen: 1, maxLen: 128 },
        newPassword:     { required: true, minLen: 8, maxLen: 128 },
    },
    registerClient: {
        client_name:   { required: true, minLen: 1, maxLen: 100 },
        contact_email: { required: true, type: 'email' },
    },
};

module.exports = { validate, sanitizeBody, rules };
