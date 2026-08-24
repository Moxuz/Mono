const crypto = require('crypto');

// A stable, non-reversible identifier lets administrators correlate security
// events without putting an email address or username into an audit record.
// Production deployments should set AUDIT_PII_SECRET explicitly. The secret
// fallbacks keep local/offline development usable without another requirement.
function getIdentitySecret() {
    return process.env.AUDIT_PII_SECRET ||
        process.env.SESSION_SECRET ||
        process.env.JWT_SECRET ||
        'local-development-audit-identity-secret';
}

function normalizeIdentity(value) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toLowerCase();
    return normalized || null;
}

function hashIdentity(value) {
    const normalized = normalizeIdentity(value);
    if (!normalized) return null;

    return crypto
        .createHmac('sha256', getIdentitySecret())
        .update(normalized, 'utf8')
        .digest('hex');
}

const EMAIL_KEYS = new Set(['email', 'emailaddress', 'contact_email', 'contactemail']);
const USERNAME_KEYS = new Set(['username', 'user_name', 'displayname', 'display_name']);
const SECRET_KEYS = new Set([
    'password',
    'passwordresettoken',
    'accesstoken',
    'refreshtoken',
    'idtoken',
    'clientsecret',
    'client_secret',
    'authorization',
    'token',
    'code',
    'codeverifier',
    'nonce',
    'sessiontoken',
    'reauthtoken',
    'cookie',
    'setcookie'
]);

const MAX_AUDIT_METADATA_DEPTH = 12;
const MAX_AUDIT_METADATA_ARRAY_ITEMS = 100;
const MAX_AUDIT_METADATA_KEYS = 100;

function keyName(key) {
    return String(key || '').replace(/[-_]/g, '').toLowerCase();
}

function sanitizeAuditMetadata(value, depth = 0) {
    if (depth > MAX_AUDIT_METADATA_DEPTH) return '[TRUNCATED]';
    if (Array.isArray(value)) {
        return value.slice(0, MAX_AUDIT_METADATA_ARRAY_ITEMS)
            .map(child => sanitizeAuditMetadata(child, depth + 1));
    }
    if (!value || typeof value !== 'object') return value;

    const sanitized = {};
    for (const [key, child] of Object.entries(value).slice(0, MAX_AUDIT_METADATA_KEYS)) {
        const normalizedKey = keyName(key);

        if (EMAIL_KEYS.has(normalizedKey)) {
            const emailHash = hashIdentity(child);
            if (emailHash) sanitized.emailHash = emailHash;
            continue;
        }

        if (USERNAME_KEYS.has(normalizedKey)) {
            const usernameHash = hashIdentity(child);
            if (usernameHash) sanitized.usernameHash = usernameHash;
            continue;
        }

        if (SECRET_KEYS.has(normalizedKey) || normalizedKey.endsWith('secret')) {
            sanitized[key] = '[REDACTED]';
            continue;
        }

        sanitized[key] = sanitizeAuditMetadata(child, depth + 1);
    }

    return sanitized;
}

function redactText(value) {
    if (typeof value !== 'string') return value;

    // Replace email-shaped text in messages and HTTP log lines with a stable
    // hash. This covers legacy call sites that interpolate an email into a
    // message instead of passing it as structured metadata.
    return value.replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 4096)
      .replace(/mongodb(?:\+srv)?:\/\/[^@\s/]+@/gi, 'mongodb://[REDACTED]@')
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT_REDACTED]')
      .replace(/([?&](?:code|state|token|access_token|refresh_token|id_token|client_secret|password|nonce|code_verifier|session_token)=)[^&\s"'<>]*/gi, '$1[REDACTED]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/gi, (email) => {
        const emailHash = hashIdentity(email);
        return emailHash ? `[email:${emailHash.slice(0, 16)}]` : '[email]';
    });
}

function redactLogMetadata(value, key = '') {
    const normalizedKey = keyName(key);
    if (EMAIL_KEYS.has(normalizedKey)) {
        const emailHash = hashIdentity(value);
        return emailHash ? `[email:${emailHash.slice(0, 16)}]` : '[email]';
    }
    if (USERNAME_KEYS.has(normalizedKey)) {
        const usernameHash = hashIdentity(value);
        return usernameHash ? `[username:${usernameHash.slice(0, 16)}]` : '[username]';
    }
    if (SECRET_KEYS.has(normalizedKey) || normalizedKey.endsWith('secret')) {
        return '[REDACTED]';
    }

    if (Array.isArray(value)) return value.map(item => redactLogMetadata(item));
    if (!value || typeof value !== 'object') return value;

    const redacted = {};
    for (const [childKey, childValue] of Object.entries(value)) {
        redacted[childKey] = redactLogMetadata(childValue, childKey);
    }
    return redacted;
}

module.exports = {
    hashIdentity,
    normalizeIdentity,
    sanitizeAuditMetadata,
    redactText,
    redactLogMetadata
};
