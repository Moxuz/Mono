const jwt = require('jsonwebtoken');
const oauthService = require('../services/oauth.service');
const User = require('../../../shared/models/User');
const Client = require('../../../shared/models/Client');
const Session = require('../../../shared/models/Session');
const logger = require('../../../shared/utils/logger');
const Consent = require('../../../shared/models/Consent');
const securityAuditService = require('../../../shared/services/securityAudit.service');
const {
    sanitizeRequestedScopes,
    validateRegisteredScopes
} = require('../../../shared/utils/oauthScopes');
const { generateCSRFToken, validateCSRFToken } = require('../../../shared/middleware/csrf');
const { parsePagination } = require('../../../shared/utils/pagination');
async function getActiveSessionUser(req) {
    const sessionUserId = req.session?.user?.id;
    if (!sessionUserId) return null;

    try {
        const user = await User.findById(sessionUserId);
        if (!user || !user.isActive) {
            if (req.session) {
                delete req.session.user;
                delete req.session.oauthClientFlow;
            }
            return null;
        }

        if (!req.session.user.sessionId) return null;
        const session = await Session.findOne({
            _id: req.session.user.sessionId,
            userId: user._id,
            isActive: true
        });
        if (!session || session.isExpired()) {
            if (session?.isExpired()) await session.revoke('expired');
            delete req.session.user;
            delete req.session.oauthClientFlow;
            return null;
        }
        return user;
    } catch (_) {
        if (req.session) {
            delete req.session.user;
            delete req.session.oauthClientFlow;
        }
        return null;
    }
}
const config = require('../../../shared/config/config');

function setOAuthNoStore(res) {
    res.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache'
    });
}

const OAUTH_INPUT_LIMITS = Object.freeze({
    clientId: 128,
    clientSecret: 256,
    authorizationCode: 512,
    redirectUri: 2048,
    codeVerifierMin: 43,
    codeVerifierMax: 128,
    refreshToken: 4096,
    bearerToken: 4096,
    sessionToken: 512
});

const OAUTH_SAFE_VALUE_RE = /^[A-Za-z0-9._~-]+$/;
const OAUTH_PRINTABLE_SECRET_RE = /^[\x21-\x7E]+$/;

function validateOAuthTokenInputs({ grantType, code, clientId, clientSecret, redirectUri, refreshToken, codeVerifier, sessionToken }) {
    if (typeof grantType !== 'string' || grantType.length > 64) return 'Invalid grant_type';

    const bounded = [
        ['client_id', clientId, OAUTH_INPUT_LIMITS.clientId],
        ['client_secret', clientSecret, OAUTH_INPUT_LIMITS.clientSecret],
        ['code', code, OAUTH_INPUT_LIMITS.authorizationCode],
        ['redirect_uri', redirectUri, OAUTH_INPUT_LIMITS.redirectUri],
        ['refresh_token', refreshToken, OAUTH_INPUT_LIMITS.refreshToken],
        ['session_token', sessionToken, OAUTH_INPUT_LIMITS.sessionToken]
    ];
    for (const [name, value, max] of bounded) {
        if (value !== undefined && value !== null &&
            (typeof value !== 'string' || value.length === 0 || value.length > max)) {
            return `${name} is invalid or exceeds its maximum length`;
        }
    }

    if (clientId && !OAUTH_SAFE_VALUE_RE.test(clientId)) return 'client_id has an invalid format';
    if (clientSecret && !OAUTH_PRINTABLE_SECRET_RE.test(clientSecret)) return 'client_secret has an invalid format';
    if (code && !OAUTH_SAFE_VALUE_RE.test(code)) return 'code has an invalid format';
    if (refreshToken && !OAUTH_SAFE_VALUE_RE.test(refreshToken)) return 'refresh_token has an invalid format';
    if (sessionToken && !OAUTH_SAFE_VALUE_RE.test(sessionToken)) return 'session_token has an invalid format';

    if (redirectUri) {
        const redirectError = validateRedirectUris([redirectUri]);
        if (redirectError) return redirectError;
    }

    if (codeVerifier !== undefined &&
        (typeof codeVerifier !== 'string' ||
            !new RegExp(`^[A-Za-z0-9._~-]{${OAUTH_INPUT_LIMITS.codeVerifierMin},${OAUTH_INPUT_LIMITS.codeVerifierMax}}$`).test(codeVerifier))) {
        return 'code_verifier must be 43-128 RFC 7636 characters';
    }

    return null;
}

function validateClientCredentialInputs(clientId, clientSecret) {
    if (clientId !== undefined && clientId !== null &&
        (typeof clientId !== 'string' || clientId.length === 0 || clientId.length > OAUTH_INPUT_LIMITS.clientId || !OAUTH_SAFE_VALUE_RE.test(clientId))) {
        return 'client_id is invalid or exceeds its maximum length';
    }
    if (clientSecret !== undefined && clientSecret !== null &&
        (typeof clientSecret !== 'string' || clientSecret.length === 0 || clientSecret.length > OAUTH_INPUT_LIMITS.clientSecret || !OAUTH_PRINTABLE_SECRET_RE.test(clientSecret))) {
        return 'client_secret is invalid or exceeds its maximum length';
    }
    return null;
}

function validateOpaqueToken(token) {
    return typeof token === 'string' && token.length > 0 &&
        token.length <= OAUTH_INPUT_LIMITS.bearerToken && OAUTH_SAFE_VALUE_RE.test(token);
}

function validateLogoUri(logoUri) {
    if (logoUri === undefined || logoUri === null || logoUri === '') return null;
    if (typeof logoUri !== 'string' || logoUri.trim() !== logoUri || logoUri.length > 2048) {
        return 'logo_uri must be a trimmed URL of 1-2048 characters';
    }
    try {
        const parsed = new URL(logoUri);
        const localDev = config.NODE_ENV !== 'production' &&
            parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
        if ((!['https:'].includes(parsed.protocol) && !localDev) || parsed.username || parsed.password || parsed.hash) {
            return 'logo_uri must use HTTPS and cannot contain credentials or fragments';
        }
    } catch {
        return 'logo_uri must be a valid absolute URL';
    }
    return null;
}

function validateRedirectUris(redirectUris) {
    if (!Array.isArray(redirectUris) || redirectUris.length < 1 || redirectUris.length > 10) {
        return 'redirect_uris must contain between 1 and 10 URLs';
    }

    for (const redirectUri of redirectUris) {
        if (typeof redirectUri !== 'string' || redirectUri.trim() !== redirectUri || redirectUri.length === 0 || redirectUri.length > 2048) {
            return 'Each redirect URI must be a trimmed string of 1-2048 characters';
        }

        let parsed;
        try {
            parsed = new URL(redirectUri);
        } catch {
            return 'Each redirect URI must be a valid absolute URL';
        }

        const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
        const isHttps = parsed.protocol === 'https:';
        const isDevelopmentLocalhost = config.NODE_ENV !== 'production' && parsed.protocol === 'http:' && isLocalhost;

        if ((!isHttps && !isDevelopmentLocalhost) || parsed.hash || parsed.username || parsed.password) {
            return config.NODE_ENV === 'production'
                ? 'Redirect URIs must use HTTPS and cannot contain fragments or credentials'
                : 'Redirect URIs must use HTTPS; HTTP is allowed only for localhost during development';
        }
    }

    return null;
}

function validateAuthorizationSecurity(client, codeChallenge, codeChallengeMethod, nonce, state) {
    if (client.application_type !== 'web' ||
        !Array.isArray(client.grant_types) ||
        !client.grant_types.includes('authorization_code') ||
        !Array.isArray(client.response_types) ||
        !client.response_types.includes('code')) {
        return 'Only confidential web clients are supported';
    }
    if (typeof state !== 'string' || !state || state.length > 2048 ||
        !/^[A-Za-z0-9._~-]+$/.test(state)) {
        return 'state is required and must be a valid OAuth value';
    }
    if (!codeChallenge) {
        return 'PKCE with S256 is required for all clients';
    }
    if (codeChallengeMethod !== 'S256') {
        return 'Only the S256 PKCE method is supported';
    }
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
        return 'code_challenge must be a valid S256 challenge';
    }
    if (typeof nonce !== 'string' || !nonce || nonce.length > 255 ||
        !/^[A-Za-z0-9._~-]+$/.test(nonce)) {
        return 'nonce is required and must be a valid OAuth value';
    }
    return null;
}

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
        if (clientData.application_type && clientData.application_type !== 'web') {
            return res.status(400).json({
                success: false,
                error: 'Only web applications are supported for this private AuthSys deployment'
            });
        }

        const redirectError = validateRedirectUris(clientData.redirect_uris);
        if (redirectError) {
            return res.status(400).json({ success: false, error: redirectError });
        }

        const logoError = validateLogoUri(clientData.logo_uri);
        if (logoError) {
            return res.status(400).json({ success: false, error: logoError });
        }

        const registeredScopes = validateRegisteredScopes(clientData.scope);
        if (!registeredScopes.valid) {
            return res.status(400).json({
                success: false,
                error: registeredScopes.error
            });
        }

        const result = await oauthService.registerClient({
            ...clientData,
            scope: registeredScopes.scopes.join(' ')
        }, ownerId);

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
        const { page, limit } = parsePagination(req.query.page, req.query.limit, 10, 100);

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
        const immutableFields = ['application_type', 'scope', 'grant_types', 'response_types', 'client_secret'];
        if (immutableFields.some((field) => Object.prototype.hasOwnProperty.call(updateData, field))) {
            return res.status(400).json({
                success: false,
                error: 'Application type, scopes, grant types, response types and client secret cannot be changed'
            });
        }

        if (updateData.redirect_uris !== undefined) {
            const redirectError = validateRedirectUris(updateData.redirect_uris);
            if (redirectError) {
                return res.status(400).json({ success: false, error: redirectError });
            }
        }

        const logoError = validateLogoUri(updateData.logo_uri);
        if (logoError) {
            return res.status(400).json({ success: false, error: logoError });
        }

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
            scope, state, code_challenge, code_challenge_method, nonce, prompt
        } = req.query;

        if (response_type !== 'code') {
            return res.status(400).json({
                error: 'unsupported_response_type',
                error_description: 'Only response_type=code is supported'
            });
        }

        if (!client_id || !redirect_uri) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'client_id and redirect_uri are required'
            });
        }
        if (state !== undefined && (typeof state !== 'string' || state.length > 2048)) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'state must be at most 2048 characters'
            });
        }
        if (prompt !== undefined && prompt !== 'none') {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Only prompt=none is supported'
            });
        }

        // 1) validate client
        const client = await Client.findActiveClient(client_id, redirect_uri);

        if (!client) {
            securityAuditService.logSecurityEvent({
                userId: null,
                action: 'client_validation_failed',
                status: 'failure',
                ipAddress: req.ip,
                metadata: { reason: 'invalid_client', client_id }
            }).catch(() => {});
            return res.status(401).json({
                error: 'invalid_client',
                error_description: 'Invalid client or redirect URI'
            });
        }

        const authorizationError = validateAuthorizationSecurity(
            client, code_challenge, code_challenge_method, nonce, state
        );
        if (authorizationError) {
            return res.status(400).json({ error: 'invalid_request', error_description: authorizationError });
        }

        const validScopes = sanitizeRequestedScopes(scope, client.scope);

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
            code_challenge_method: code_challenge_method || '',
            ...(nonce ? { nonce } : {}),
        });

        // 2) เช็ค session
        const sessionUser = await getActiveSessionUser(req);

        if (sessionUser) {
            // ─── login แล้ว → เช็ค consent ───────────────────────
            const consent = await Consent.getActiveGrant(
                sessionUser._id, client_id, requestedScope
            );

            if (consent) {
                // เคย consent แล้ว → ออก code เลย
                const pkce = code_challenge
                    ? { code_challenge, code_challenge_method }
                    : null;

                const code = await oauthService.generateAuthorizationCode(
                    sessionUser._id, client_id, redirect_uri, requestedScope, pkce, nonce, consent.grantId
                );

                const sep = redirect_uri.includes('?') ? '&' : '?';
                return res.redirect(
                    `${redirect_uri}${sep}code=${code}` +
                    `${state ? `&state=${encodeURIComponent(state)}` : ''}`
                );
            }

            // ─── login แล้ว แต่ยังไม่ consent ───────────────────
            if (prompt === 'none') {
                const separator = redirect_uri.includes('?') ? '&' : '?';
                const stateParam = state ? `&state=${encodeURIComponent(state)}` : '';
                return res.redirect(
                    `${redirect_uri}${separator}error=consent_required${stateParam}`
                );
            }
            baseParams.set('mode',       'consent');

        } else {
            if (prompt === 'none') {
                const separator = redirect_uri.includes('?') ? '&' : '?';
                const stateParam = state ? `&state=${encodeURIComponent(state)}` : '';
                return res.redirect(
                    `${redirect_uri}${separator}error=login_required${stateParam}`
                );
            }

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
            scope, state,
            code_challenge, code_challenge_method,
            action, response_type, nonce
        } = req.body;

        if (response_type !== 'code') {
            return res.status(400).json({
                error: 'unsupported_response_type',
                error_description: 'Only response_type=code is supported'
            });
        }

        // ─── validate client ───────────────────────────────────────
        if (!client_id || !redirect_uri) {
            return res.status(400).json({ error: 'client_id and redirect_uri are required' });
        }
        if (state !== undefined && (typeof state !== 'string' || state.length > 2048)) {
            return res.status(400).json({ error: 'state must be at most 2048 characters' });
        }

        const client = await Client.findActiveClient(client_id, redirect_uri);
        if (!client) {
            return res.status(400).json({ error: 'Invalid client or redirect URI' });
        }

        const authorizationError = validateAuthorizationSecurity(
            client, code_challenge, code_challenge_method, nonce, state
        );
        if (authorizationError) {
            return res.status(400).json({ error: 'invalid_request', error_description: authorizationError });
        }

        // The browser consent page uses the AuthSys session cookie. Bind its
        // state-changing POST to a short-lived CSRF token. Authorization must
        // always use the already-authenticated AuthSys browser session.
        const sessionUser = await getActiveSessionUser(req);
        if (sessionUser && !validateCSRFToken(req.body.csrf_token, sessionUser._id.toString())) {
            return res.status(403).json({ error: 'csrf_invalid', error_description: 'Invalid authorization request' });
        }

        const sep = redirect_uri.includes('?') ? '&' : '?';
        if (!['allow', 'deny'].includes(action)) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'action must be allow or deny'
            });
        }

        // ─── Deny ──────────────────────────────────────────────────
        // Validate the client and callback before returning an error redirect.
        if (action === 'deny') {
            if (req.session?.oauthClientFlow?.clientId === client_id) {
                delete req.session.oauthClientFlow;
            }
            return res.json({
                success: false,
                redirect_url: `${redirect_uri}${sep}error=access_denied` +
                    `${state ? `&state=${encodeURIComponent(state)}` : ''}`
            });
        }

        if (!sessionUser) {
            return res.status(401).json({
                error: 'login_required',
                error_description: 'Sign in to AuthSys before approving an application'
            });
        }
        const userId = sessionUser._id.toString();

        // ─── บันทึก Consent ───────────────────────────────────────
        // Validate and sanitize scope, then clamp to client's registered scope.
        const validScopes = sanitizeRequestedScopes(scope, client.scope);

        if (validScopes.length === 0) {
            return res.status(400).json({
                error: 'invalid_scope',
                error_description: 'The requested scopes are not permitted for this client'
            });
        }

        const sanitizedScope = validScopes.join(' ');

        const consent = await Consent.saveConsent(userId, client_id, sanitizedScope);
        if (req.session?.oauthClientFlow?.clientId === client_id) {
            delete req.session.oauthClientFlow;
        }
        securityAuditService.logSecurityEvent({
            userId,
            action: 'consent_granted',
            status: 'success',
            ipAddress: req.ip,
            metadata: { clientId: client_id, scope: sanitizedScope }
        }).catch(() => {});

        // ─── ออก code ─────────────────────────────────────────────
        const pkce = code_challenge
            ? { code_challenge, code_challenge_method }
            : null;

        const code = await oauthService.generateAuthorizationCode(
            userId, client_id, redirect_uri,
            sanitizedScope,
            pkce,
            nonce,
            consent.grantId
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
        setOAuthNoStore(res);
        let {
            code,
            client_id,
            client_secret,
            redirect_uri,
            grant_type,
            refresh_token,
            code_verifier,
            session_token
        } = req.body;

        // Support the RFC 6749 client_secret_basic method advertised by
        // discovery, while retaining client_secret_post for existing clients.
        const basic = req.headers.authorization;
        if ((!client_id || !client_secret) && basic?.startsWith('Basic ')) {
            try {
                const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8');
                const separator = decoded.indexOf(':');
                if (separator > 0) {
                    client_id = decodeURIComponent(decoded.slice(0, separator));
                    client_secret = decodeURIComponent(decoded.slice(separator + 1));
                }
            } catch {
                return res.status(401).json({
                    error: 'invalid_client',
                    error_description: 'Invalid client authentication'
                });
            }
        }

        const inputError = validateOAuthTokenInputs({
            grantType: grant_type,
            code,
            clientId: client_id,
            clientSecret: client_secret,
            redirectUri: redirect_uri,
            refreshToken: refresh_token,
            codeVerifier: code_verifier,
            sessionToken: session_token
        });
        if (inputError) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: inputError
            });
        }

        if (grant_type === 'refresh_token') {
            if (!refresh_token) {
                return res.status(400).json({
                    error: 'invalid_request',
                    error_description: 'refresh_token is required'
                });
            }

            // This server registers confidential OAuth clients. Require the
            // client credentials on refresh so a stolen refresh token cannot
            // be replayed by an unrelated application.
            if (!client_id || !client_secret) {
                return res.status(401).json({
                    error: 'invalid_client',
                    error_description: 'client_id and client_secret are required'
                });
            }
            const refreshClient = await Client.findOne({ client_id, isActive: true }).select('+client_secret');
            if (!refreshClient || refreshClient.application_type !== 'web' ||
                !Array.isArray(refreshClient.grant_types) ||
                !refreshClient.grant_types.includes('refresh_token') ||
                !(await refreshClient.compareSecret(client_secret))) {
                return res.status(401).json({
                    error: 'invalid_client',
                    error_description: 'Invalid client credentials'
                });
            }
            const refreshClaims = jwt.decode(refresh_token);
            if (!refreshClaims || refreshClaims.client_id !== client_id) {
                return res.status(401).json({
                    error: 'invalid_grant',
                    error_description: 'Refresh token does not belong to this client'
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


        if (!code_verifier) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'code_verifier is required for authorization_code'
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
        res.status(401).json({
            error: 'invalid_grant',
            error_description: error.name === 'TokenExpiredError'
                ? 'Authorization grant expired'
                : 'Invalid authorization grant'
        });
    }
};
/**
 * UserInfo endpoint (OIDC)
 * รองรับทั้ง token จาก /api/auth/login และ /api/oauth/token
 */
exports.userinfo = async (req, res, next) => {
    try {
        setOAuthNoStore(res);
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

        const jwt = require('jsonwebtoken');
        const token = req.headers.authorization?.split(' ')[1];
        const decoded = token ? jwt.decode(token) : null;

        securityAuditService.logSecurityEvent({
            userId: decoded?.sub || decoded?.id || null,
            action: 'userinfo_failed',
            status: 'failure',
            ipAddress: req.ip,
            metadata: { reason: 'invalid_token', detail: error.message }
        }).catch(() => {});

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
            error_description: 'Invalid access token'
        });
    }
};

exports.revokeToken = async (req, res, next) => {
    try {
        setOAuthNoStore(res);
        let { token, client_id, client_secret } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token is required'
            });
        }

        const basic = req.headers.authorization;
        if ((!client_id || !client_secret) && basic?.startsWith('Basic ')) {
            const decodedBasic = Buffer.from(basic.slice(6), 'base64').toString('utf8');
            const separator = decodedBasic.indexOf(':');
            if (separator > 0) {
                client_id = decodeURIComponent(decodedBasic.slice(0, separator));
                client_secret = decodeURIComponent(decodedBasic.slice(separator + 1));
            }
        }

        const credentialError = validateClientCredentialInputs(client_id, client_secret);
        if (credentialError || !validateOpaqueToken(token)) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: credentialError || 'token is invalid or exceeds its maximum length'
            });
        }

        const claims = jwt.decode(token);
        if (!claims?.sub) {
            return res.status(400).json({ error: 'invalid_request', error_description: 'Invalid token' });
        }

        let userId = claims.sub;
        if (client_id || client_secret) {
            if (!client_id || !client_secret) {
                return res.status(401).json({ error: 'invalid_client', error_description: 'Complete client authentication is required' });
            }
            const client = await Client.findOne({ client_id, isActive: true }).select('+client_secret');
            if (!client || !(await client.compareSecret(client_secret))) {
                return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials' });
            }
            if (claims.client_id && claims.client_id !== client_id) {
                return res.status(401).json({ error: 'invalid_client', error_description: 'Token does not belong to this client' });
            }
        } else {
            // First-party compatibility path: validate the bearer as a live
            // access token before allowing it to revoke itself.
            const bearer = basic?.startsWith('Bearer ') ? basic.slice(7) : null;
            if (!bearer) {
                return res.status(401).json({ error: 'invalid_client', error_description: 'OAuth client credentials or matching bearer token required' });
            }
            const bearerClaims = await oauthService.verifyAccessToken(bearer);
            if (bearerClaims.sub !== claims.sub) {
                return res.status(403).json({ error: 'access_denied', error_description: 'Token belongs to another user' });
            }
            userId = bearerClaims.sub;
        }

        await oauthService.revokeToken(token, userId, 'user_logout');

        logger.info('Token revoked', { user: userId });

        res.json({
            success: true,
            message: 'Token revoked successfully'
        });
    } catch (error) {
        logger.error('Revoke token error:', error);
        res.status(401).json({
            success: false,
            error: 'invalid_request',
            error_description: 'Unable to revoke token'
        });
    }
};

/**
 * Introspect token
 */
exports.introspectToken = async (req, res, next) => {
    try {
        setOAuthNoStore(res);
        let { token, client_id, client_secret } = req.body;

        if ((!client_id || !client_secret) && req.headers.authorization?.startsWith('Basic ')) {
            const decodedBasic = Buffer.from(req.headers.authorization.slice(6), 'base64').toString('utf8');
            const separator = decodedBasic.indexOf(':');
            if (separator > 0) {
                client_id = decodeURIComponent(decodedBasic.slice(0, separator));
                client_secret = decodeURIComponent(decodedBasic.slice(separator + 1));
            }
        }

        const credentialError = validateClientCredentialInputs(client_id, client_secret);
        if (credentialError || !validateOpaqueToken(token)) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: credentialError || 'token is invalid or exceeds its maximum length'
            });
        }

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

        const claims = jwt.decode(token);
        if (!claims?.client_id || claims.client_id !== client_id) {
            // With valid introspection credentials, an unknown or foreign token
            // is a normal inactive result, not a client-authentication failure.
            return res.json({ active: false });
        }

        const result = await oauthService.introspectToken(token);

        res.json(result);
    } catch (error) {
        logger.error('Introspect token error:', error);
        res.status(401).json({
            active: false,
            error: 'invalid_token',
            error_description: 'Unable to introspect token'
        });
    }
};

/**
 * Revoke user consent for a specific OAuth client (PDPA right to object)
 * DELETE /api/oauth/consents/:clientId
 */
exports.revokeConsent = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const { clientId } = req.params;

        if (!clientId) {
            return res.status(400).json({ success: false, error: 'clientId is required' });
        }

        await Consent.revokeConsent(userId, clientId, 'user_request');

        logger.info(`Consent revoked: userId=${userId} clientId=${clientId}`);

        res.json({ success: true, message: 'Consent revoked successfully' });
    } catch (error) {
        logger.error('Revoke consent error:', error);
        next(error);
    }
}; 

/**
 * List the current user's active OAuth consents.
 * GET /api/oauth/consents
 */
exports.listConsents = async (req, res, next) => {
    try {
        const consents = await Consent.find({
            userId: req.user.id,
            revokedAt: null,
            expiresAt: { $gt: new Date() }
        }).sort({ updatedAt: -1 }).lean();

        const clientIds = consents.map(consent => consent.clientId);
        const clients = await Client.find({ client_id: { $in: clientIds } })
            .select('client_id client_name logo_uri')
            .lean();
        const clientMap = new Map(clients.map(client => [client.client_id, client]));

        res.json({
            success: true,
            data: {
                consents: consents.map(consent => ({
                    client_id: consent.clientId,
                    client_name: clientMap.get(consent.clientId)?.client_name || 'Unknown application',
                    logo_uri: clientMap.get(consent.clientId)?.logo_uri || null,
                    scope: consent.scope,
                    granted_at: consent.grantedAt,
                    expires_at: consent.expiresAt
                }))
            }
        });
    } catch (error) {
        logger.error('List consent error:', error);
        next(error);
    }
};

/**
 * Issue a short-lived CSRF token for the browser consent form.
 * GET /api/oauth/csrf
 */
exports.csrfToken = async (req, res) => {
    const user = await getActiveSessionUser(req);
    if (!user) {
        return res.status(401).json({ error: 'login_required' });
    }
    res.json({ csrf_token: generateCSRFToken(user._id.toString()) });
};
