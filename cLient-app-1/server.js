require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const connectMongo = require('connect-mongo');
const axios      = require('axios');
const path       = require('path');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3001;

const config = {
    appName:          process.env.APP_NAME          || 'Client App 1',
    oauthProvider:    process.env.OAUTH_PROVIDER    || 'http://localhost:5000',
    // Browser-facing redirect URL (must be reachable by the user's browser)
    oauthPublicUrl:   process.env.OAUTH_PUBLIC_URL  || process.env.OAUTH_PROVIDER || 'http://localhost:5000',
    clientId:         process.env.CLIENT_ID,
    clientSecret:     process.env.CLIENT_SECRET,
    redirectUri:      process.env.REDIRECT_URI      || `http://localhost:${PORT}/callback`,
    sessionSecret:    process.env.SESSION_SECRET,
    mongoUrl:         process.env.MONGODB_URI,
    cookieSecure:     process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'
};

let MongoStore = connectMongo;
if (typeof connectMongo !== 'function' || typeof connectMongo.create !== 'function') {
    try {
        // connect-mongo v3 exports a session factory; v5 exports the class
        // directly with a static create() method.
        MongoStore = connectMongo(session);
    } catch (_) {
        MongoStore = connectMongo;
    }
}
const createMongoStore = (url, collection) => {
    if (!url) return undefined;
    if (typeof MongoStore.create === 'function') {
        return MongoStore.create({ mongoUrl: url, collectionName: collection, ttl: 86400 });
    }
    return new MongoStore({ url, collection, ttl: 86400 });
};

if (!config.sessionSecret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production');
}
if (!config.mongoUrl && process.env.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI is required in production');
}
if (process.env.NODE_ENV === 'production' && (!config.clientId || !config.clientSecret || !process.env.REDIRECT_URI)) {
    throw new Error('CLIENT_ID, CLIENT_SECRET, and REDIRECT_URI are required in production');
}
config.sessionSecret ||= crypto.randomBytes(32).toString('hex');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cookieParser = require('cookie-parser');
app.use(cookieParser());

app.set('trust proxy', 1);
app.use(session({
    secret:            config.sessionSecret,
    resave:            false,
    saveUninitialized: false,
    store: createMongoStore(config.mongoUrl, 'client_sessions'),
    cookie: { secure: config.cookieSecure, httpOnly: true, maxAge: 86400000, sameSite: 'lax' }
}));

// ─── Middleware ───────────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: http:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

function requireAuth(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/login');
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
    if (normalizeIssuer(claims.iss) !== normalizeIssuer(config.oauthPublicUrl) ||
        !audiences.includes(config.clientId) ||
        typeof claims.exp !== 'number' || claims.exp <= now ||
        (typeof claims.iat === 'number' && claims.iat > now + 60) ||
        claims.nonce !== expectedNonce) {
        throw new Error('Invalid ID token claims');
    }
    return claims;
}

async function establishClientSession(req, user, accessToken, idToken) {
    const cookieConsent = req.session.cookieConsent;
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.user = user;
    req.session.accessToken = accessToken;
    req.session.idToken = idToken;
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
    res.json({ status: 'ok', app: config.appName });
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

    if (error)                return res.redirect(`/?error=${encodeURIComponent(error)}`);
    if (state !== savedState) return res.redirect('/?error=invalid_state');
    if (!code || !codeVerifier || !savedNonce) return res.redirect('/?error=missing_params');

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
            { headers: { 'Content-Type': 'application/json' } }
        );

        const { access_token, id_token } = tokenRes.data;
        if (typeof access_token !== 'string' || typeof id_token !== 'string') {
            throw new Error('OAuth token response is incomplete');
        }

        await verifyIdToken(id_token, savedNonce);
        const userRes = await axios.get(
            `${config.oauthProvider}/api/oauth/userinfo`,
            { headers: { 'Authorization': `Bearer ${access_token}` } }
        );

        await establishClientSession(req, userRes.data, access_token, id_token);

        res.redirect('/dashboard');

    } catch (err) {
        console.error('OAuth error:', err.response?.data || err.message);
        res.redirect('/?error=auth_failed');
    }
});

// Refresh is intentionally disabled for this small private client.
app.post('/api/refresh', (req, res) => {
    return res.status(410).json({
        success: false,
        error: 'offline_access_disabled',
        error_description: 'This private client does not use refresh tokens'
    });
});

// Legacy social callback. New social login uses /callback with an authorization
// code. Never accept bearer tokens in query parameters.
app.get('/social-callback', async (req, res) => {
    res.redirect('/?error=legacy_social_callback_disabled');
});

// Privacy policy belongs to the auth service but remains portable across hosts.
app.get('/privacy-policy', (req, res) => {
    res.redirect(`${config.oauthPublicUrl}/privacy-policy.html`);
});

// Keep client cookie consent in this client's server-side session. OAuth access
// tokens are issued by AuthSys and must not be sent to first-party HS256 APIs.
app.post('/api/cookie-consent', async (req, res) => {
    const { cookieConsentAccepted, analyticsAccepted, version } = req.body || {};
    if (typeof cookieConsentAccepted !== 'boolean') {
        return res.status(400).json({ success: false, error: 'cookieConsentAccepted must be boolean' });
    }
    req.session.cookieConsent = {
        cookieConsentAccepted,
        analyticsAccepted: typeof analyticsAccepted === 'boolean' ? analyticsAccepted : false,
        version: typeof version === 'string' ? version.slice(0, 32) : '1.0.0',
        updatedAt: new Date().toISOString()
    };
    req.session.save((err) => {
        if (err) return res.status(500).json({ success: false, error: 'Could not save cookie consent' });
        return res.json({ success: true });
    });
});

// Logout must be a state-changing POST so a link or crawler cannot sign a user out.
app.post('/logout', async (req, res) => {
    const accessToken = req.session?.accessToken;
    await revokeAuthToken(accessToken);
    req.session.destroy(err => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

// ─── API ──────────────────────────────────────────────────────
app.get('/api/session', (req, res) => {
    res.json({
        authenticated:  !!req.session.user,
        user:           req.session.user  || null
    });
});


// ─── Start ────────────────────────────────────────────────────
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
