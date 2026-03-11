require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

const config = {
    appName: process.env.APP_NAME || 'Client App 1',
    oauthProvider: process.env.OAUTH_PROVIDER || 'http://localhost:5000',
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`,
    sessionSecret: process.env.SESSION_SECRET || 'change_this_secret'
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ✅ session แค่ครั้งเดียว
app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// ✅ PKCE helpers
function generateCodeVerifier() {
    return crypto.randomBytes(32)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function generateCodeChallenge(verifier) {
    return crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');

    const state         = crypto.randomBytes(16).toString('hex');
    const codeVerifier  = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    req.session.oauthState   = state;
    req.session.codeVerifier = codeVerifier;

    req.session.save((err) => {
        if (err) {
            console.error('Session save error:', err);
            return res.status(500).send('Session error');
        }

        console.log('=== PKCE Generated ===');
        console.log('codeVerifier  :', codeVerifier);
        console.log('codeChallenge :', codeChallenge);
        console.log('state         :', state);
        console.log('======================');

        const authUrl = `${config.oauthProvider}/api/oauth/authorize?` +
            `client_id=${config.clientId}&` +
            `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
            `response_type=code&` +
            `scope=openid profile email&` +
            `state=${state}&` +
            `code_challenge=${codeChallenge}&` +
            `code_challenge_method=S256`;

        console.log('Auth URL:', authUrl);
        res.redirect(authUrl);
    });
});

app.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;

    console.log('=== Callback ===');
    console.log('state received  :', state);
    console.log('state in session:', req.session.oauthState);
    console.log('codeVerifier    :', req.session.codeVerifier);
    console.log('================');

    if (error) {
        return res.send(`<h1>Error</h1><p>${error}</p><a href="/">Go back</a>`);
    }

    if (state !== req.session.oauthState) {
        return res.send('<h1>Error</h1><p>Invalid state parameter</p>');
    }

    if (!code) {
        return res.send('<h1>Error</h1><p>No authorization code received</p>');
    }

    const codeVerifier = req.session.codeVerifier;
    if (!codeVerifier) {
        return res.send('<h1>Error</h1><p>Missing code verifier</p>');
    }

    try {
        const tokenResponse = await axios.post(
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

        const { access_token, id_token } = tokenResponse.data;

        const userResponse = await axios.get(
            `${config.oauthProvider}/api/oauth/userinfo`,
            { headers: { 'Authorization': `Bearer ${access_token}` } }
        );

        delete req.session.codeVerifier;
        delete req.session.oauthState;

        req.session.user        = userResponse.data;
        req.session.accessToken = access_token;
        req.session.idToken     = id_token;

        res.redirect('/dashboard');

    } catch (err) {
        console.error('OAuth error:', err.response?.data || err.message);
        res.send(`
            <h1>Authentication Error</h1>
            <p>${err.response?.data?.error_description || err.message}</p>
            <a href="/">Go back</a>
        `);
    }
});

app.get('/dashboard', requireAuth, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${config.appName} - Dashboard</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .card { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
                h1 { color: #007bff; }
                .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; }
                .btn:hover { background: #0056b3; }
                .user-info { background: #e7f3ff; }
                pre { background: #f4f4f4; padding: 15px; border-radius: 4px; overflow-x: auto; }
            </style>
        </head>
        <body>
            <h1>🛒 ${config.appName}</h1>
            <div class="card user-info">
                <h2>Welcome, ${req.session.user.username}!</h2>
                <p><strong>Email:</strong> ${req.session.user.email}</p>
                <p><strong>User ID:</strong> ${req.session.user.sub}</p>
                <p><strong>Role:</strong> ${req.session.user.role || 'user'}</p>
            </div>
            <div class="card">
                <h3>Access Token</h3>
                <pre>${req.session.accessToken.substring(0, 100)}...</pre>
            </div>
            <div class="card">
                <h3>User Information</h3>
                <pre>${JSON.stringify(req.session.user, null, 2)}</pre>
            </div>
            <div class="card">
                <h3>Quick Links</h3>
                <a href="/" class="btn">Home</a>
                <a href="/products" class="btn">Products</a>
                <a href="/profile" class="btn">Profile</a>
                <a href="/logout" class="btn" style="background:#dc3545;">Logout</a>
            </div>
        </body>
        </html>
    `);
});

app.get('/products', requireAuth, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Products</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 1200px; margin: 50px auto; padding: 20px; }
                .product-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
                .product-card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; text-align: center; }
                .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 5px; }
            </style>
        </head>
        <body>
            <h1>🛒 Products</h1>
            <p>Welcome, ${req.session.user.username}!</p>
            <a href="/dashboard" class="btn">Back to Dashboard</a>
            <div class="product-grid" style="margin-top:30px;">
                <div class="product-card">
                    <div style="background:#007bff; height:150px; display:flex; align-items:center; justify-content:center; color:white; font-size:3rem;">📱</div>
                    <h3>Smartphone</h3>
                    <p>\\$599</p>
                    <button class="btn">Add to Cart</button>
                </div>
                <div class="product-card">
                    <div style="background:#28a745; height:150px; display:flex; align-items:center; justify-content:center; color:white; font-size:3rem;">💻</div>
                    <h3>Laptop</h3>
                    <p>\\$999</p>
                    <button class="btn">Add to Cart</button>
                </div>
                <div class="product-card">
                    <div style="background:#ffc107; height:150px; display:flex; align-items:center; justify-content:center; color:white; font-size:3rem;">🎧</div>
                    <h3>Headphones</h3>
                    <p>\\$199</p>
                    <button class="btn">Add to Cart</button>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.get('/profile', requireAuth, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Profile</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                .card { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
                .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
            </style>
        </head>
        <body>
            <h1>👤 Profile</h1>
            <div class="card">
                <h2>${req.session.user.username}</h2>
                <p><strong>Email:</strong> ${req.session.user.email}</p>
                <p><strong>Role:</strong> ${req.session.user.role || 'user'}</p>
                <p><strong>Email Verified:</strong> ${req.session.user.email_verified ? '✅' : '❌'}</p>
            </div>
            <a href="/dashboard" class="btn">Back to Dashboard</a>
        </body>
        </html>
    `);
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

app.get('/api/session', (req, res) => {
    res.json({
        authenticated: !!req.session.user,
        user: req.session.user || null
    });
});

app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════════╗
    ║  🛒 ${config.appName}
    ║  
    ║  🌐 URL: http://localhost:${PORT}
    ║  🔐 OAuth Provider: ${config.oauthProvider}
    ║  📱 Client ID: ${config.clientId || 'NOT SET'}
    ║  
    ║  Status: ${config.clientId ? '✅ Configured' : '⚠️  Need Configuration'}
    ╚════════════════════════════════════════════╝
    `);
});