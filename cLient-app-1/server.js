require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');
const axios      = require('axios');
const path       = require('path');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3001;
app.set('query parser', 'simple');

const config = {
    appName:          process.env.APP_NAME          || 'Client App 1',
    oauthProvider:    process.env.OAUTH_PROVIDER    || 'http://localhost:5000',
    // Browser-facing redirect URL (must be reachable by the user's browser)
    oauthPublicUrl:   process.env.OAUTH_PUBLIC_URL  || process.env.OAUTH_PROVIDER || 'http://localhost:5000',
    clientId:         process.env.CLIENT_ID,
    clientSecret:     process.env.CLIENT_SECRET,
    redirectUri:      process.env.REDIRECT_URI      || `http://localhost:${PORT}/callback`,
    sessionSecret:    process.env.SESSION_SECRET,
    useRedisSessions: process.env.USE_REDIS_SESSIONS === 'true' || process.env.NODE_ENV === 'production',
    redisHost:        process.env.REDIS_HOST || 'localhost',
    redisPort:        Number(process.env.REDIS_PORT || 6379),
    redisPassword:    process.env.REDIS_PASSWORD || '',
    cookieSecure:     process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'
};

if (!config.sessionSecret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production');
}
if (process.env.NODE_ENV === 'production' && config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
}
if (process.env.NODE_ENV === 'production' && (!config.useRedisSessions || !config.redisPassword)) {
    throw new Error('Redis-backed client sessions and REDIS_PASSWORD are required in production');
}
if (process.env.NODE_ENV === 'production' && (!config.clientId || !config.clientSecret || !process.env.REDIRECT_URI)) {
    throw new Error('CLIENT_ID, CLIENT_SECRET, and REDIRECT_URI are required in production');
}
config.sessionSecret ||= crypto.randomBytes(32).toString('hex');

let sessionRedisClient = null;
let clientSessionStore;
if (config.useRedisSessions) {
    sessionRedisClient = createClient({
        socket: {
            host: config.redisHost,
            port: config.redisPort,
            connectTimeout: 3000,
            reconnectStrategy: (retries) => retries >= 3 ? false : Math.min(retries * 100, 500)
        },
        ...(config.redisPassword ? { password: config.redisPassword } : {})
    });
    sessionRedisClient.on('error', (error) => console.warn('Client session Redis error:', error.message));
    clientSessionStore = new RedisStore({ client: sessionRedisClient, prefix: 'client1:sess:' });
}

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const cookieParser = require('cookie-parser');
app.use(cookieParser());

app.set('trust proxy', 1);
app.use(session({
    secret:            config.sessionSecret,
    resave:            false,
    saveUninitialized: false,
    store: clientSessionStore,
    cookie: { secure: config.cookieSecure, httpOnly: true, maxAge: 86400000, sameSite: 'lax' }
}));

// ─── Middleware ───────────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

function destroyClientSession(req) {
    return new Promise((resolve) => {
        if (!req.session) return resolve();
        req.session.destroy(() => resolve());
    });
}

async function hasActiveClientGrant(req) {
    const user = req.session?.user;
    const accessToken = req.session?.accessToken;
    if (!user?.sub || !accessToken || !config.clientId || !config.clientSecret) return false;

    try {
        const response = await axios.post(`${config.oauthProvider}/api/oauth/introspect`, {
            token: accessToken,
            client_id: config.clientId,
            client_secret: config.clientSecret
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });

        return response.data?.active === true && response.data.sub === user.sub;
    } catch (_) {
        // A relying party must fail closed when it cannot confirm that the
        // account, consent, client, and access token are still active.
        return false;
    }
}

async function requireAuth(req, res, next) {
    if (await hasActiveClientGrant(req)) {
        res.set('Cache-Control', 'no-store');
        return next();
    }
    await destroyClientSession(req);
    return res.redirect('/login');
}

// Do not let the static-file middleware bypass the auth-protected page routes.
for (const page of ['dashboard.html', 'products.html', 'profile.html']) {
    app.get(`/${page}`, requireAuth, (req, res) =>
        res.sendFile(path.join(__dirname, 'public', page))
    );
}

app.use(express.static(path.join(__dirname, 'public')));

// ─── PKCE ────────────────────────────────────────────────────
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - normalized.length % 4) % 4);
    return Buffer.from(normalized + padding, 'base64');
}

function normalizeIssuer(value) {
    return String(value || '').replace(/\/+$/, '');
}

function timingSafeStringEqual(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireSameOrigin(req, res, next) {
    const expected = `${req.protocol}://${req.get('host')}`;
    const origin = req.get('origin');
    const referer = req.get('referer');
    let actual = origin;
    if (!actual && referer) {
        try { actual = new URL(referer).origin; } catch (_) { actual = null; }
    }
    if (actual !== expected) return res.status(403).json({ success: false, error: 'Cross-origin request blocked' });
    return next();
}

async function verifyIdToken(idToken, expectedNonce) {
    if (typeof idToken !== 'string' || !expectedNonce) throw new Error('Missing ID token');
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Malformed ID token');

    let header;
    let claims;
    try {
        header = JSON.parse(decodeBase64Url(parts[0]).toString('utf8'));
        claims = JSON.parse(decodeBase64Url(parts[1]).toString('utf8'));
    } catch (_) {
        throw new Error('Malformed ID token claims');
    }
    if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported ID token signing key');
    const jwksResponse = await axios.get(`${config.oauthProvider}/.well-known/jwks.json`, { timeout: 5000 });
    const jwk = jwksResponse.data?.keys?.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) throw new Error('ID token signing key not found');
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii');
    const validSignature = crypto.verify('RSA-SHA256', signingInput, publicKey, decodeBase64Url(parts[2]));
    if (!validSignature) throw new Error('Invalid ID token signature');

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const audienceValid = audiences.includes(config.clientId) &&
        (audiences.length === 1 || claims.azp === config.clientId);
    if (normalizeIssuer(claims.iss) !== normalizeIssuer(config.oauthPublicUrl) ||
        !audienceValid ||
        typeof claims.sub !== 'string' || !claims.sub ||
        typeof claims.exp !== 'number' || claims.exp <= now ||
        typeof claims.iat !== 'number' || claims.iat > now + 60 ||
        claims.nonce !== expectedNonce) {
        throw new Error('Invalid ID token claims');
    }
    return claims;
}

async function establishClientSession(req, user, accessToken) {
    const cookieConsent = req.session.cookieConsent;
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.user = user;
    req.session.accessToken = accessToken;
    if (cookieConsent) req.session.cookieConsent = cookieConsent;
    await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}

async function revokeAuthToken(token) {
    if (!token || !config.clientId || !config.clientSecret) return;
    try {
        await axios.post(`${config.oauthProvider}/api/oauth/revoke`, {
            token,
            client_id: config.clientId,
            client_secret: config.clientSecret
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
    } catch (error) {
        console.warn('OAuth token revoke failed:', error.response?.status || error.message);
    }
}

// ─── Routes ──────────────────────────────────────────────────

// Lightweight unauthenticated probe for Docker/VPS health checks.
app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const ready = !config.useRedisSessions || sessionRedisClient?.isReady;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded' });
});

// Static pages (serve HTML files)
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/products',  requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.get('/profile',   requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));

// Login → redirect ไป Auth Server. Both local login and social login use
// Authorization Code + PKCE; no access/refresh token is placed in a URL.
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');

    const state         = crypto.randomBytes(16).toString('hex');
    const codeVerifier  = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const nonce         = crypto.randomBytes(16).toString('hex');

    res.cookie('oauth_state', state, {
        httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: 300000
    });
    res.cookie('oauth_code_verifier', codeVerifier, {
        httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: 300000
    });
    res.cookie('oauth_nonce', nonce, {
        httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: 300000
    });

    const provider = ['google', 'github'].includes(req.query.provider)
        ? `/api/auth/${req.query.provider}`
        : '/api/oauth/authorize';
    const silent = req.query.silent === '1' || req.query.prompt === 'none';
    const promptParam = provider === '/api/oauth/authorize' && silent
        ? '&prompt=none'
        : '';
    const authUrl = `${config.oauthPublicUrl}${provider}?` +
        `client_id=${encodeURIComponent(config.clientId || '')}&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
        `response_type=code&scope=openid%20profile%20email&` +
        `state=${encodeURIComponent(state)}&` +
        `code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&nonce=${encodeURIComponent(nonce)}` +
        promptParam;

    res.redirect(authUrl);
});

// OAuth Callback
app.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const savedState   = req.cookies?.oauth_state;
    const codeVerifier = req.cookies?.oauth_code_verifier;
    const savedNonce   = req.cookies?.oauth_nonce;

    res.clearCookie('oauth_state');
    res.clearCookie('oauth_code_verifier');
    res.clearCookie('oauth_nonce');

    const safeError = typeof error === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(error) ? error : 'oauth_error';
    if (!timingSafeStringEqual(state, savedState)) return res.redirect('/?error=invalid_state');
    if (error) return res.redirect(`/?error=${encodeURIComponent(safeError)}`);
    if (typeof code !== 'string' || code.length > 512 || !/^[A-Za-z0-9._~-]+$/.test(code) ||
        typeof codeVerifier !== 'string' || !savedNonce) return res.redirect('/?error=missing_params');

    try {
        const tokenRes = await axios.post(
            `${config.oauthProvider}/api/oauth/token`,
            {
                code,
                client_id:     config.clientId,
                client_secret: config.clientSecret,
                redirect_uri:  config.redirectUri,
                grant_type:    'authorization_code',
                code_verifier: codeVerifier
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        );

        const { access_token, id_token } = tokenRes.data;
        if (typeof access_token !== 'string' || typeof id_token !== 'string') {
            throw new Error('OAuth token response is incomplete');
        }

        const idClaims = await verifyIdToken(id_token, savedNonce);
        const userRes = await axios.get(
            `${config.oauthProvider}/api/oauth/userinfo`,
            { headers: { 'Authorization': `Bearer ${access_token}` }, timeout: 5000 }
        );
        if (typeof userRes.data?.sub !== 'string' || userRes.data.sub !== idClaims.sub) {
            throw new Error('UserInfo subject does not match ID token');
        }

        await establishClientSession(req, userRes.data, access_token);

        res.redirect('/dashboard');

    } catch (err) {
        console.error('OAuth error:', err.response?.data || err.message);
        res.redirect('/?error=auth_failed');
    }
});

// Privacy policy belongs to the auth service but remains portable across hosts.
app.get('/privacy-policy', (req, res) => {
    res.redirect(`${config.oauthPublicUrl}/privacy-policy.html`);
});

// Keep client cookie consent in this client's server-side session. OAuth access
// tokens are issued by AuthSys and must not be sent to first-party HS256 APIs.
app.post('/api/cookie-consent', requireSameOrigin, async (req, res) => {
    const { cookieConsentAccepted, analyticsAccepted, version } = req.body || {};
    if (typeof cookieConsentAccepted !== 'boolean') {
        return res.status(400).json({ success: false, error: 'cookieConsentAccepted must be boolean' });
    }
    req.session.cookieConsent = {
        cookieConsentAccepted,
        analyticsAccepted: typeof analyticsAccepted === 'boolean' ? analyticsAccepted : false,
        version: typeof version === 'string' ? version.slice(0, 32) : '1.1.0',
        updatedAt: new Date().toISOString()
    };
    req.session.save((err) => {
        if (err) return res.status(500).json({ success: false, error: 'Could not save cookie consent' });
        return res.json({ success: true });
    });
});

// Logout must be a state-changing POST so a link or crawler cannot sign a user out.
app.post('/logout', requireSameOrigin, async (req, res) => {
    const accessToken = req.session?.accessToken;
    await revokeAuthToken(accessToken);
    req.session.destroy(err => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

// ─── API ──────────────────────────────────────────────────────
app.get('/api/session', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const authenticated = await hasActiveClientGrant(req);
    if (!authenticated && req.session?.user) await destroyClientSession(req);
    res.json({
        authenticated,
        user: authenticated ? req.session.user : null
    });
});


// ─── Start ────────────────────────────────────────────────────
async function startClient() {
    if (sessionRedisClient) await sessionRedisClient.connect();
    app.listen(PORT, () => {
        console.log(`
    ╔════════════════════════════════════════════╗
    ║  🛒 ${config.appName}
    ║  🌐 URL: http://localhost:${PORT}
    ║  🔐 OAuth: ${config.oauthProvider}
    ║  Status: ${config.clientId ? '✅ Ready' : '⚠️  Missing CLIENT_ID'}
    ╚════════════════════════════════════════════╝
    `);
    });
}

startClient().catch((error) => {
    console.error('Client App 1 failed to start:', error.message);
    process.exit(1);
});
