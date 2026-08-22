/**
 * CSRF protection for AuthSys browser sessions.
 *
 * Tokens are stateless HMAC-signed values so every app replica can validate
 * them. The token is still bound to the authenticated user and expires soon.
 */

const crypto = require('crypto');

const TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

function csrfSecret() {
    return process.env.CSRF_SECRET ||
        process.env.SESSION_SECRET ||
        process.env.JWT_SECRET ||
        'development-csrf-secret';
}

function generateCSRFToken(userId) {
    if (!userId) return '';

    const payload = Buffer.from(JSON.stringify({
        userId: String(userId),
        issuedAt: Date.now(),
        nonce: crypto.randomBytes(16).toString('hex')
    })).toString('base64url');

    const signature = crypto
        .createHmac('sha256', csrfSecret())
        .update(payload)
        .digest('base64url');

    return payload + '.' + signature;
}

function validateCSRFToken(token, userId) {
    if (typeof token !== 'string' || !token || !userId) return false;

    const [payload, signature] = token.split('.');
    if (!payload || !signature || token.split('.').length !== 2) return false;

    try {
        const expected = crypto
            .createHmac('sha256', csrfSecret())
            .update(payload)
            .digest('base64url');

        const actualBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (actualBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
            return false;
        }

        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (String(data.userId) !== String(userId) || typeof data.issuedAt !== 'number') {
            return false;
        }

        const age = Date.now() - data.issuedAt;
        return age >= -MAX_CLOCK_SKEW_MS && age <= TOKEN_TTL_MS;
    } catch (_) {
        return false;
    }
}

function isSameOriginRequest(req) {
    const expectedOrigin = req.protocol + '://' + req.get('host');
    const origin = req.get('origin');

    if (origin) {
        return origin === expectedOrigin;
    }

    const referer = req.get('referer');
    if (!referer) return false;

    try {
        return new URL(referer).origin === expectedOrigin;
    } catch (_) {
        return false;
    }
}

/**
 * CSRF protection middleware.
 * Bearer-authenticated API clients are not cookie-authenticated; browser
 * session mutations require a signed token or same-origin proof.
 */
function csrfProtection(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    if (req.path.startsWith('/api/')) {
        const sessionUserId = req.session?.user?.id;
        const hasExplicitAuthorization = Boolean(req.get('authorization'));

        if (sessionUserId && !hasExplicitAuthorization) {
            // OAuth consent submits the signed token as csrf_token in its JSON body.
            // Accept it alongside the generic _csrf and header forms so the
            // global middleware and OAuth controller enforce the same contract.
            const token = req.body?._csrf || req.body?.csrf_token || req.get('x-csrf-token');
            if (token && validateCSRFToken(token, sessionUserId)) {
                return next();
            }

            if (!isSameOriginRequest(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF validation failed',
                    message: 'State-changing browser requests must be same-origin'
                });
            }
        }

        return next();
    }

    const token = req.body?._csrf || req.body?.csrf_token || req.get('x-csrf-token');

    if (!validateCSRFToken(token, userId)) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token missing or invalid',
            message: 'Please refresh the page and try again'
        });
    }

    next();
}

function csrfToken(req, res, next) {
    const userId = req.user?.id || req.session?.user?.id;

    if (userId) {
        res.locals.csrfToken = generateCSRFToken(userId);
    }

    next();
}

module.exports = {
    generateCSRFToken,
    validateCSRFToken,
    csrfProtection,
    csrfToken,
    isSameOriginRequest
};
