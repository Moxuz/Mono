 const oauthService = require('../services/oauth.service');
const User = require('../../../shared/models/User');
const Client = require('../../../shared/models/Client');
const logger = require('../../../shared/utils/logger');
const Consent = require('../../../shared/models/Consent');

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


// ─────────────────────────────────────────────────────────────────
// GET /api/oauth/authorize
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// GET /api/oauth/authorize
// ─────────────────────────────────────────────────────────────────
exports.showAuthorizeForm = async (req, res, next) => {
    try {
        const {
            client_id, redirect_uri, response_type,
            scope, state, code_challenge, code_challenge_method
        } = req.query;

        // 1) validate client
        const client = await Client.findOne({
            client_id,
            redirect_uris: redirect_uri,
            isActive: true
        });

        if (!client) {
            return res.status(400).send('<h1>Invalid Client</h1>');
        }

        // Validate and sanitize scope
        const rawScope = scope
            ? scope.replace(/[^\w\s:]/g, '').trim()
            : 'openid profile email';

        // Enforce scope: openid/profile/email always allowed; anything else must be
        // in the client's registered scope or it is silently dropped.
        const OIDC_BASE = new Set(['openid', 'profile', 'email']);
        const clientAllowed = new Set(client.scope ? client.scope.split(/\s+/) : []);
        const validScopes = rawScope.split(/\s+/).filter(s => s && (OIDC_BASE.has(s) || clientAllowed.has(s)));

        if (validScopes.length === 0) {
            return res.status(400).send('<h1>invalid_scope</h1><p>The requested scopes are not permitted for this client.</p>');
        }

        const requestedScope = validScopes.join(' ');

        // ─── params ที่จะส่งไป consent.html ─────────────────────
        const baseParams = new URLSearchParams({
            client_id,
            client_name:          client.client_name,
            redirect_uri,
            response_type:        response_type || 'code',
            scope:                requestedScope,
            state:                state               || '',
            code_challenge:       code_challenge       || '',
            code_challenge_method: code_challenge_method || 'S256',
        });

        // 2) เช็ค session
        const sessionUser = req.session?.user;

        if (sessionUser) {
            // ─── login แล้ว → เช็ค consent ───────────────────────
            const alreadyConsented = await Consent.hasConsented(
                sessionUser.id, client_id, requestedScope
            );

            if (alreadyConsented) {
                // เคย consent แล้ว → ออก code เลย
                const pkce = code_challenge
                    ? { code_challenge, code_challenge_method: code_challenge_method || 'S256' }
                    : null;

                const code = await oauthService.generateAuthorizationCode(
                    sessionUser.id, client_id, redirect_uri, requestedScope, pkce
                );

                const sep = redirect_uri.includes('?') ? '&' : '?';
                return res.redirect(
                    `${redirect_uri}${sep}code=${code}` +
                    `${state ? `&state=${encodeURIComponent(state)}` : ''}`
                );
            }

            // ─── login แล้ว แต่ยังไม่ consent ───────────────────
            baseParams.set('mode',       'consent');
            baseParams.set('user_email', sessionUser.email);

        } else {
            // ─── ยังไม่ login → redirect ไป login.html พร้อม returnTo ──
            const returnTo = `/api/oauth/authorize?${baseParams.toString()}`;
            return res.redirect(`/login.html?returnTo=${encodeURIComponent(returnTo)}`);
        }

        // redirect ไป consent.html พร้อม params
        return res.redirect(`/consent.html?${baseParams.toString()}`);

    } catch (error) {
        logger.error('Show authorize form error:', error);
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/oauth/authorize
// ─────────────────────────────────────────────────────────────────
exports.authorize = async (req, res, next) => {
    try {
        const {
            client_id, redirect_uri,
            scope, state, email, password,
            code_challenge, code_challenge_method,
            action
        } = req.body;

        const sep = redirect_uri.includes('?') ? '&' : '?';

        // ─── Deny ──────────────────────────────────────────────────
        if (action === 'deny') {
            return res.json({
                success: false,
                redirect_url: `${redirect_uri}${sep}error=access_denied` +
                    `${state ? `&state=${encodeURIComponent(state)}` : ''}`
            });
        }

        // ─── validate client ───────────────────────────────────────
        const client = await Client.findActiveClient(client_id, redirect_uri);
        if (!client) {
            return res.status(400).json({ error: 'Invalid client or redirect URI' });
        }

        let userId;

        // ─── เช็ค session ─────────────────────────────────────────
        if (req.session?.user) {
            userId = req.session.user.id;
        } else {
            // ต้อง login
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            const bcrypt = require('bcryptjs');
            const user   = await User.findOne({ email }).select('+password');
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            if (!user.isActive) {
                return res.status(403).json({ error: 'Account is inactive' });
            }

            // บันทึก session
            req.session.user = {
                id:       user._id.toString(),
                email:    user.email,
                username: user.username,
                role:     user.role
            };

            userId = user._id.toString();
        }

        // ─── บันทึก Consent ───────────────────────────────────────
        // Validate and sanitize scope, then clamp to client's registered scope
        const rawScope = scope
            ? scope.replace(/[^\w\s:]/g, '').trim()
            : 'openid profile email';

        const OIDC_BASE = new Set(['openid', 'profile', 'email']);
        const clientAllowed = new Set(client.scope ? client.scope.split(/\s+/) : []);
        const validScopes = rawScope.split(/\s+/).filter(s => s && (OIDC_BASE.has(s) || clientAllowed.has(s)));

        if (validScopes.length === 0) {
            return res.status(400).json({
                error: 'invalid_scope',
                error_description: 'The requested scopes are not permitted for this client'
            });
        }

        const sanitizedScope = validScopes.join(' ');

        await Consent.saveConsent(userId, client_id, sanitizedScope);

        // ─── ออก code ─────────────────────────────────────────────
        const pkce = code_challenge
            ? { code_challenge, code_challenge_method: code_challenge_method || 'S256' }
            : null;

        const code = await oauthService.generateAuthorizationCode(
            userId, client_id, redirect_uri,
            sanitizedScope,
            pkce
        );

        logger.info(`OAuth Authorization granted: user=${userId} client=${client_id}`, {
            userId,
            client_id,
            scope: sanitizedScope,
            redirect_uri
        });

        res.json({
            success: true,
            redirect_url: `${redirect_uri}${sep}code=${code}` +
                `${state ? `&state=${encodeURIComponent(state)}` : ''}`
        });

    } catch (error) {
        logger.error('Authorization error:', { 
            error: error.message,
            client_id: req.body.client_id,
            userId: req.session?.user?.id 
        });
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
            code_verifier,
            session_token
        } = req.body;

        if (grant_type === 'refresh_token') {
            if (!refresh_token) {
                return res.status(400).json({
                    error: 'invalid_request',
                    error_description: 'refresh_token is required'
                });
            }
            const result = await oauthService.refreshAccessToken(refresh_token, { sessionToken: session_token });
            
            logger.info(`OAuth Token refreshed: client=${client_id}`, {
                client_id,
                grant_type: 'refresh_token'
            });

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


        const tokens = await oauthService.exchangeCodeForTokens(
            code,
            client_id,
            client_secret,
            redirect_uri,
            code_verifier
        );

        logger.info(`OAuth Token issued: client=${client_id}`, {
            client_id,
            grant_type: 'authorization_code'
        });

        res.json(tokens);

    } catch (error) {
        logger.error('Token endpoint error:', {
            error: error.message,
            client_id: req.body.client_id,
            grant_type: req.body.grant_type
        });
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
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'invalid_token',
                error_description: 'Valid authorization header required'
            });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                error: 'invalid_token',
                error_description: 'No token provided'
            });
        }

        // ใช้ service เพื่อ get user info
        const userInfo = await oauthService.getUserInfo(token);

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

        await oauthService.revokeToken(token, userId, 'user_logout');

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
        const { token, client_id, client_secret } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Token is required'
            });
        }

        // Require client authentication before allowing introspection
        if (!client_id || !client_secret) {
            return res.status(401).json({
                error: 'invalid_client',
                error_description: 'client_id and client_secret are required'
            });
        }

        const client = await Client.findOne({ client_id, isActive: true }).select('+client_secret');
        if (!client || !(await client.compareSecret(client_secret))) {
            return res.status(401).json({
                error: 'invalid_client',
                error_description: 'Invalid client credentials'
            });
        }

        const result = await oauthService.introspectToken(token);

        res.json(result);
    } catch (error) {
        logger.error('Introspect token error:', error);
        next(error);
    }
}; 
