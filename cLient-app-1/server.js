require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
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
    sessionSecret:    process.env.SESSION_SECRET    || 'change_this_secret'
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const cookieParser = require('cookie-parser');
app.use(cookieParser());

const MemoryStore = require('memorystore')(session);
app.use(session({
    secret:            config.sessionSecret,
    resave:            false,
    saveUninitialized: false,
    store: new MemoryStore({ checkPeriod: 86400000 }),
    cookie: { secure: false, httpOnly: true, maxAge: 86400000, sameSite: 'lax' }
}));

// ─── Middleware ───────────────────────────────────────────────
function requireAuth(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/login');
}

// ─── PKCE ────────────────────────────────────────────────────
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Routes ──────────────────────────────────────────────────

// Static pages (serve HTML files)
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/products',  requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.get('/profile',   requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));

// Login → redirect ไป Auth Server
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');

    const state         = crypto.randomBytes(16).toString('hex');
    const codeVerifier  = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    res.cookie('oauth_state',         state,        { httpOnly: true, sameSite: 'lax', maxAge: 300000 });
    res.cookie('oauth_code_verifier', codeVerifier, { httpOnly: true, sameSite: 'lax', maxAge: 300000 });

    const authUrl = `${config.oauthPublicUrl}/api/oauth/authorize?` +
        `client_id=${config.clientId}&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
        `response_type=code&scope=openid profile email&` +
        `state=${state}&` +
        `code_challenge=${codeChallenge}&code_challenge_method=S256`;

    res.redirect(authUrl);
});

// OAuth Callback
app.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const savedState   = req.cookies?.oauth_state;
    const codeVerifier = req.cookies?.oauth_code_verifier;

    if (error)                return res.redirect(`/?error=${error}`);
    if (state !== savedState) return res.redirect('/?error=invalid_state');
    if (!code || !codeVerifier) return res.redirect('/?error=missing_params');

    res.clearCookie('oauth_state');
    res.clearCookie('oauth_code_verifier');

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

        const { access_token, refresh_token, id_token } = tokenRes.data;

        const userRes = await axios.get(
            `${config.oauthProvider}/api/oauth/userinfo`,
            { headers: { 'Authorization': `Bearer ${access_token}` } }
        );

        req.session.user         = userRes.data;
        req.session.accessToken  = access_token;
        req.session.refreshToken = refresh_token; // ✅ เพิ่ม
        req.session.idToken      = id_token;

        res.redirect('/dashboard');

    } catch (err) {
        console.error('OAuth error:', err.response?.data || err.message);
        res.redirect('/?error=auth_failed');
    }
});

// ─── /api/refresh ─────────────────────────────────────────────
app.post('/api/refresh', async (req, res) => {
    const refreshToken = req.session?.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({
            success: false,
            error: 'No refresh token'
        });
    }

    try {
        const tokenRes = await axios.post(
            `${config.oauthProvider}/api/oauth/token`,
            {
                grant_type:    'refresh_token',
                refresh_token: refreshToken,
                client_id:     config.clientId,
                client_secret: config.clientSecret
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const { access_token } = tokenRes.data;

        // ✅ อัพเดท session
        req.session.accessToken = access_token;

        res.json({
            success: true,
            access_token
        });

    } catch (err) {
        console.error('Refresh error:', err.response?.data || err.message);

        // refresh_token หมดอายุ → ล้าง session
        req.session.destroy(() => {});

        res.status(401).json({
            success: false,
            error: 'Refresh token expired'
        });
    }
});

// Social Login Callback — receives JWT from auth server after Google/GitHub login
app.get('/social-callback', async (req, res) => {
    const { token, refreshToken } = req.query;
    if (!token) return res.redirect('/?error=missing_token');

    try {
        const userRes = await axios.get(
            `${config.oauthProvider}/api/auth/profile`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        req.session.user         = userRes.data.data || userRes.data;
        req.session.accessToken  = token;
        req.session.refreshToken = refreshToken || null;
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Social callback error:', err.response?.data || err.message);
        res.redirect('/?error=auth_failed');
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

// ─── API ──────────────────────────────────────────────────────
app.get('/api/session', (req, res) => {
    res.json({
        authenticated:  !!req.session.user,
        user:           req.session.user  || null,
        accessToken:    req.session.accessToken  || null  // ✅ ส่งไปให้ frontend
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