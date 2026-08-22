require('dotenv').config();

const axios = require('axios');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const connectMongo = require('connect-mongo');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 3002);
const config = {
    appName: process.env.APP_NAME || 'Workspace Client 2',
    oauthProvider: process.env.OAUTH_PROVIDER || 'http://localhost:5000',
    oauthPublicUrl: process.env.OAUTH_PUBLIC_URL || process.env.OAUTH_PROVIDER || 'http://localhost:5000',
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    redirectUri: process.env.REDIRECT_URI || `http://localhost:${port}/callback`,
    sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    mongoUrl: process.env.MONGODB_URI || '',
    cookieSecure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'
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

if (process.env.NODE_ENV === 'production' && !config.mongoUrl) {
    throw new Error('MONGODB_URI is required in production');
}
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
}
if (process.env.NODE_ENV === 'production' && (!config.clientId || !config.clientSecret || !process.env.REDIRECT_URI)) {
    throw new Error('CLIENT_ID, CLIENT_SECRET, and REDIRECT_URI are required in production');
}

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: createMongoStore(config.mongoUrl, 'client2_sessions'),
    cookie: {
        secure: config.cookieSecure,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

function requireAuth(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/login');
}

function base64Url(value) {
    return value.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function createVerifier() {
    return base64Url(crypto.randomBytes(32));
}

function createChallenge(verifier) {
    return base64Url(crypto.createHash('sha256').update(verifier).digest());
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

app.get('/dashboard.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
    res.redirect('/dashboard.html');
});

// Keep static assets after the protected page route so dashboard.html cannot
// be served without an authenticated session.
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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard.html');

    const state = crypto.randomBytes(16).toString('hex');
    const verifier = createVerifier();
    const challenge = createChallenge(verifier);
    const nonce = crypto.randomBytes(16).toString('hex');

    res.cookie('oauth_state', state, {
        httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: 300000
    });
    res.cookie('oauth_code_verifier', verifier, {
        httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: 300000
    });
    res.cookie('oauth_nonce', nonce, {
        httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: 300000
    });

    const authorizeUrl = new URL('/api/oauth/authorize', config.oauthPublicUrl);
    authorizeUrl.search = new URLSearchParams({
        client_id: config.clientId,
        client_name: config.appName,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid profile email',
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256'
    }).toString();

    res.redirect(authorizeUrl.toString());
});

app.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const savedState = req.cookies.oauth_state;
    const verifier = req.cookies.oauth_code_verifier;
    const savedNonce = req.cookies.oauth_nonce;

    res.clearCookie('oauth_state');
    res.clearCookie('oauth_code_verifier');
    res.clearCookie('oauth_nonce');

    if (error) return res.redirect(`/?error=${encodeURIComponent(error)}`);
    if (!code || !verifier || !savedNonce || state !== savedState) {
        return res.redirect('/?error=invalid_oauth_callback');
    }

    try {
        const tokenResponse = await axios.post(
            `${config.oauthProvider}/api/oauth/token`,
            {
                code,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: config.redirectUri,
                grant_type: 'authorization_code',
                code_verifier: verifier
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const { access_token, id_token } = tokenResponse.data;
        await verifyIdToken(id_token, savedNonce);
        const userResponse = await axios.get(
            `${config.oauthProvider}/api/oauth/userinfo`,
            { headers: { Authorization: `Bearer ${access_token}` } }
        );

        // Tokens stay on the server. The browser receives only the session cookie.
        req.session.user = userResponse.data;
        req.session.accessToken = access_token;
        req.session.idToken = id_token;

        await new Promise((resolve, reject) => {
            req.session.save((err) => err ? reject(err) : resolve());
        });
        res.redirect('/dashboard.html');
    } catch (errorResponse) {
        console.error('Client 2 OAuth error:', errorResponse.response?.data || errorResponse.message);
        res.redirect('/?error=oauth_exchange_failed');
    }
});

app.get('/api/session', (req, res) => {
    res.json({ authenticated: !!req.session.user, user: req.session.user || null });
});

app.post('/api/cookie-consent', async (req, res) => {
    const { cookieConsentAccepted, analyticsAccepted, version } = req.body || {};
    if (typeof cookieConsentAccepted !== 'boolean' || typeof analyticsAccepted !== 'boolean') {
        return res.status(400).json({ success: false, error: 'Consent values must be boolean' });
    }

    req.session.cookieConsent = {
        cookieConsentAccepted,
        analyticsAccepted,
        version: typeof version === 'string' ? version.slice(0, 32) : '1.0.0',
        updatedAt: new Date().toISOString()
    };

    try {
        await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
        return res.json({ success: true });
    } catch (error) {
        console.error('Client 2 cookie consent error:', error.message);
        return res.status(500).json({ success: false, error: 'Could not save cookie consent' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: config.appName });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

app.get('/privacy-policy', (req, res) => {
    res.redirect(`${config.oauthPublicUrl}/privacy-policy.html`);
});

app.listen(port, () => {
    console.log(`${config.appName} listening on http://localhost:${port}`);
});
