 const oauthService = require('../services/oauth.service');
const User = require('../../../shared/models/User');
const Client = require('../../../shared/models/Client');
const logger = require('../../../shared/utils/logger');


const logRequest = (req) => {
    console.log('=== OAuth Request ===');
    console.log('URL:', req.url);
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    console.log('==================');
};

/**
 * Register new OAuth client
 */
exports.registerClient = async (req, res, next) => {
    try {
        const clientData = req.body;
        const ownerId = req.user.id;

        // Validate required fields
        if (!clientData.client_name || !clientData.redirect_uris || !clientData.contact_email) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: client_name, redirect_uris, contact_email'
            });
        }

        const result = await oauthService.registerClient(clientData, ownerId);

        logger.info('OAuth client registered', { 
            client_id: result.client_id,
            owner: ownerId 
        });

        res.status(201).json({
            success: true,
            message: 'Client registered successfully. Save your client_secret - you won\'t see it again!',
            data: result
        });
    } catch (error) {
        logger.error('Client registration error:', error);
        next(error);
    }
};

/**
 * List all clients for authenticated user
 */
exports.listClients = async (req, res, next) => {
    try {
        const ownerId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const result = await oauthService.listClients(ownerId, page, limit);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('List clients error:', error);
        next(error);
    }
};

/**
 * Get specific client
 */
exports.getClient = async (req, res, next) => {
    try {
        const clientId = req.params.id;
        const ownerId = req.user.id;

        const client = await oauthService.getClient(clientId, ownerId);

        res.json({
            success: true,
            data: client
        });
    } catch (error) {
        logger.error('Get client error:', error);
        next(error);
    }
};

/**
 * Update client
 */
exports.updateClient = async (req, res, next) => {
    try {
        const clientId = req.params.id;
        const ownerId = req.user.id;
        const updateData = req.body;

        const client = await oauthService.updateClient(clientId, updateData, ownerId);

        logger.info('Client updated', { client_id: clientId });

        res.json({
            success: true,
            message: 'Client updated successfully',
            data: client
        });
    } catch (error) {
        logger.error('Update client error:', error);
        next(error);
    }
};

/**
 * Delete client
 */
exports.deleteClient = async (req, res, next) => {
    try {
        const clientId = req.params.id;
        const ownerId = req.user.id;

        await oauthService.deleteClient(clientId, ownerId);

        logger.info('Client deleted', { client_id: clientId });

        res.json({
            success: true,
            message: 'Client deactivated successfully'
        });
    } catch (error) {
        logger.error('Delete client error:', error);
        next(error);
    }
};

/**
 * Show authorization form (GET)
 */
exports.showAuthorizeForm = async (req, res, next) => {
    try {
        const { 
            client_id, redirect_uri, response_type, 
            scope, state,
            code_challenge,        // ✅ เพิ่ม
            code_challenge_method  // ✅ เพิ่ม
        } = req.query;

        const client = await Client.findOne({ 
            client_id,
            redirect_uris: redirect_uri,
            isActive: true
        });

        if (!client) {
            return res.status(400).send(`<h1>Invalid Client</h1>`);
        }

        const safeClientName  = client.client_name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeScope       = scope || 'openid profile email';

        const scopeItems = safeScope.split(' ').map(s => {
            const descriptions = {
                'openid':  'Verify your identity',
                'profile': 'Access your basic profile information',
                'email':   'Access your email address',
                'read':    'Read your data',
                'write':   'Modify your data'
            };
            return `<div class="permission-item">${descriptions[s] || s}</div>`;
        }).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Authorize ${safeClientName}</title>
                <link rel="stylesheet" href="/css/style.css">
                <style>
                    .auth-container {
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .consent-box {
                        background: white;
                        padding: 3rem;
                        border-radius: 16px;
                        max-width: 450px;
                        width: 100%;
                        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
                    }
                    .app-info {
                        text-align: center;
                        margin-bottom: 2rem;
                        padding-bottom: 2rem;
                        border-bottom: 1px solid #e2e8f0;
                    }
                    .app-icon { font-size: 4rem; margin-bottom: 1rem; }
                    .permissions {
                        background: #f8fafc;
                        padding: 1.5rem;
                        border-radius: 8px;
                        margin: 1.5rem 0;
                    }
                    .permission-item {
                        display: flex;
                        align-items: center;
                        padding: 0.5rem 0;
                        color: #334155;
                    }
                    .permission-item::before {
                        content: "✓";
                        color: #10b981;
                        font-weight: bold;
                        margin-right: 0.5rem;
                    }
                    .alert-error {
                        background: #fee2e2;
                        color: #dc2626;
                        border: 1px solid #fca5a5;
                        padding: 0.75rem 1rem;
                        border-radius: 8px;
                        margin-bottom: 1rem;
                        display: none;
                    }
                    .pkce-badge {
                        display: inline-block;
                        background: #dcfce7;
                        color: #166534;
                        font-size: 0.75rem;
                        padding: 0.25rem 0.75rem;
                        border-radius: 999px;
                        margin-top: 0.5rem;
                    }
                </style>
            </head>
            <body>
                <div class="auth-container">
                    <div class="consent-box">
                        <div class="app-info">
                            <div class="app-icon">🔐</div>
                            <h2>${safeClientName}</h2>
                            <p style="color:#64748b; margin-top:0.5rem;">
                                wants to access your account
                            </p>
                            ${code_challenge 
                                ? '<span class="pkce-badge">🛡️ PKCE Protected</span>' 
                                : ''}
                        </div>

                        <div class="permissions">
                            <h3 style="margin-top:0; margin-bottom:1rem; font-size:1rem;">
                                This application will be able to:
                            </h3>
                            ${scopeItems}
                        </div>

                        <div id="alert" class="alert-error"></div>

                        <form id="authorizeForm" class="auth-form">
                            <input type="hidden" name="client_id"             value="${client_id}">
                            <input type="hidden" name="redirect_uri"          value="${redirect_uri}">
                            <input type="hidden" name="response_type"         value="${response_type}">
                            <input type="hidden" name="scope"                 value="${safeScope}">
                            <input type="hidden" name="state"                 value="${state || ''}">
                            <!--  เพิ่ม PKCE fields -->
                            <input type="hidden" name="code_challenge"        value="${code_challenge || ''}">
                            <input type="hidden" name="code_challenge_method" value="${code_challenge_method || 'S256'}">

                            <div class="form-group">
                                <label for="email">Email</label>
                                <input type="email" id="email" name="email" required>
                            </div>
                            <div class="form-group">
                                <label for="password">Password</label>
                                <input type="password" id="password" name="password" required>
                            </div>

                            <button type="submit" id="btnAuthorize" 
                                class="btn btn-primary btn-block">
                                Authorize &amp; Continue
                            </button>
                            <button type="button" id="btnDeny" 
                                class="btn btn-secondary btn-block">
                                Cancel
                            </button>
                        </form>

                        <div style="text-align:center; margin-top:1.5rem; 
                            padding-top:1.5rem; border-top:1px solid #e2e8f0;">
                            <small style="color:#64748b;">
                                By authorizing, you allow ${safeClientName} 
                                to access your information.
                            </small>
                        </div>
                    </div>
                </div>

                <script>
                    var REDIRECT_URI = document.querySelector('[name="redirect_uri"]').value;
                    var STATE = document.querySelector('[name="state"]').value;

                    document.getElementById('btnDeny').addEventListener('click', function() {
                        window.location.href = REDIRECT_URI + 
                            '?error=access_denied' + 
                            (STATE ? '&state=' + encodeURIComponent(STATE) : '');
                    });

                    document.getElementById('authorizeForm').addEventListener('submit', async function(e) {
                        e.preventDefault();

                        var btn = document.getElementById('btnAuthorize');
                        btn.disabled = true;
                        btn.textContent = 'Authorizing...';

                        var formData = new FormData(e.target);
                        var data = Object.fromEntries(formData);

                        try {
                            var response = await fetch('/api/oauth/authorize', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(data)
                            });

                            var result = await response.json();

                            if (result.redirect_url) {
                                window.location.href = result.redirect_url;
                                return;
                            }

                            showAlert(result.error || 'Authorization failed');

                        } catch (err) {
                            showAlert('Network error. Please try again.');
                        } finally {
                            btn.disabled = false;
                            btn.textContent = 'Authorize & Continue';
                        }
                    });

                    function showAlert(message) {
                        var el = document.getElementById('alert');
                        el.textContent = message;
                        el.style.display = 'block';
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        logger.error('Show authorize form error:', error);
        next(error);
    }
};

// authorize POST - บันทึก PKCE
exports.authorize = async (req, res, next) => {
    try {
        const { 
            client_id, redirect_uri, response_type, 
            scope, state, email, password,
            code_challenge,        // 
            code_challenge_method  // 
        } = req.body;

         console.log('=== Authorize POST received ===');
        console.log('code_challenge       :', code_challenge);
        console.log('code_challenge_method:', code_challenge_method);
        console.log('===============================');

        const client = await Client.findActiveClient(client_id, redirect_uri);
        if (!client) {
            return res.status(400).json({ error: 'Invalid client or redirect URI' });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: 'Account is inactive' });
        }

        // ✅ ส่ง PKCE ไปเก็บกับ authorization code
        const pkce = code_challenge 
            ? { code_challenge, code_challenge_method: code_challenge_method || 'S256' }
            : null;

        const code = await oauthService.generateAuthorizationCode(
            user._id, client_id, redirect_uri,
            scope || 'openid profile email',
            pkce  
        );

        logger.info('Authorization granted', { user: user.email, client: client_id });

        const separator = redirect_uri.includes('?') ? '&' : '?';
        const redirectUrl = `${redirect_uri}${separator}code=${code}` +
            `${state ? `&state=${encodeURIComponent(state)}` : ''}`;

        res.json({ success: true, redirect_url: redirectUrl });

    } catch (error) {
        logger.error('Authorization error:', error);
        next(error);
    }
};

// token endpoint - รับ code_verifier
exports.token = async (req, res, next) => {
    try {
        const { 
            code, 
            client_id, 
            client_secret, 
            redirect_uri, 
            grant_type, 
            refresh_token,
            code_verifier  
        } = req.body;

        console.log('=== Token Endpoint ===');
        console.log('grant_type   :', grant_type);
        console.log('code_verifier:', code_verifier); // ✅ เพิ่ม log
        console.log('======================');

        if (grant_type === 'refresh_token') {
            const result = await oauthService.refreshAccessToken(refresh_token);
            return res.json(result);
        }

        if (grant_type !== 'authorization_code') {
            return res.status(400).json({
                error: 'unsupported_grant_type',
                error_description: 'Only authorization_code and refresh_token are supported'
            });
        }

        if (!code || !client_id || !client_secret || !redirect_uri) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing required parameters'
            });
        }

        // ✅ ส่ง code_verifier ไปด้วย
        const tokens = await oauthService.exchangeCodeForTokens(
            code, 
            client_id, 
            client_secret, 
            redirect_uri,
            code_verifier  // ✅ ต้องส่งตรงนี้
        );

        logger.info('Tokens issued', { client_id });
        res.json(tokens);

    } catch (error) {
        logger.error('Token endpoint error:', error);
        res.status(400).json({
            error: 'invalid_grant',
            error_description: error.message
        });
    }
};
/**
 * UserInfo endpoint (OIDC)
 * รองรับทั้ง token จาก /api/auth/login และ /api/oauth/token
 */
exports.userinfo = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            console.log('No token provided to userinfo endpoint');
            return res.status(401).json({
                error: 'invalid_token',
                error_description: 'No token provided'
            });
        }

        console.log('UserInfo endpoint called with token');

        // ใช้ service เพื่อ get user info
        const userInfo = await oauthService.getUserInfo(token);

        console.log('UserInfo returned successfully');
        res.json(userInfo);
        
    } catch (error) {
        logger.error('UserInfo endpoint error:', error);
        
        // Error handling
        if (error.message.includes('expired')) {
            return res.status(401).json({
                error: 'invalid_token',
                error_description: 'Token has expired'
            });
        }
        
        if (error.message.includes('not found')) {
            return res.status(404).json({
                error: 'user_not_found',
                error_description: 'User not found'
            });
        }

        res.status(401).json({
            error: 'invalid_token',
            error_description: error.message || 'Invalid token'
        });
    }
};

exports.revokeToken = async (req, res, next) => {
    try {
        const { token } = req.body;
        const userId = req.user.id;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token is required'
            });
        }

        await oauthService.revokeToken(token, userId, 'user_request');

        logger.info('Token revoked', { user: userId });

        res.json({
            success: true,
            message: 'Token revoked successfully'
        });
    } catch (error) {
        logger.error('Revoke token error:', error);
        next(error);
    }
};

/**
 * Introspect token
 */
exports.introspectToken = async (req, res, next) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Token is required'
            });
        }

        const result = await oauthService.introspectToken(token);

        res.json(result);
    } catch (error) {
        logger.error('Introspect token error:', error);
        next(error);
    }
}; 
