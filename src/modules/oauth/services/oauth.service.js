const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Client = require('../../../shared/models/Client');
const User = require('../../../shared/models/User');
const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
const Consent = require('../../../shared/models/Consent');
const AuthorizationCode = require('../../../shared/models/AuthorizationCode');
const config = require('../../../shared/config/config');
const securityAuditService = require('../../../shared/services/securityAudit.service');
const logger = require('../../../shared/utils/logger');
const { parseScopes } = require('../../../shared/utils/oauthScopes');
const oidcKeys = require('../../../shared/config/oidcKeys');

class OAuthService {

    // ─────────────────────────────────────────
    // Authorization Code
    // ─────────────────────────────────────────

    async generateAuthorizationCode(userId, clientId, redirectUri, scope, pkce = null, nonce = null, grantId = null) {
        if (!pkce?.code_challenge || pkce.code_challenge_method !== 'S256' || !nonce) {
            throw new Error('Authorization code requires S256 PKCE and nonce');
        }

        try {
            const consent = await Consent.getActiveGrant(userId, clientId, scope);
            if (!consent || (grantId && String(consent.grantId) !== String(grantId))) {
                throw new Error('OAuth grant is inactive');
            }

            const code = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

            const authCodeData = {
                code,
                clientId,
                userId,
                grantId: consent.grantId,
                redirectUri,
                scope,
                expiresAt
            };

            authCodeData.nonce = nonce;
            authCodeData.code_challenge = pkce.code_challenge;
            authCodeData.code_challenge_method = pkce.code_challenge_method;

            await AuthorizationCode.create(authCodeData);

            logger.info('Authorization code created', {
                clientId,
                userId,
                grantId: consent.grantId,
                hasPKCE: true
            });

            return code;
        } catch (error) {
            logger.error('generateAuthorizationCode failed:', error.message);
            throw error;
        }
    }
    // ─────────────────────────────────────────

    verifyPKCE(codeVerifier, codeChallenge, method = 'S256') {
        // Only S256 is accepted — plain is insecure and rejected
        if (method !== 'S256') {
            logger.warn('PKCE rejected: only S256 method is supported');
            return false;
        }

        // RFC 7636 requires a high-entropy unreserved-string verifier. Keep
        // this check in the service as well as the HTTP controller so direct
        // service callers cannot bypass the PKCE constraint.
        if (typeof codeVerifier !== 'string' ||
            !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier) ||
            typeof codeChallenge !== 'string' ||
            !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
            return false;
        }

        const hash = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        const expected = Buffer.from(hash, 'ascii');
        const actual = Buffer.from(codeChallenge, 'ascii');
        return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    }

    // ─────────────────────────────────────────
    // Exchange Code for Tokens
    // ─────────────────────────────────────────

    async exchangeCodeForTokens(code, clientId, clientSecret, redirectUri, codeVerifier = null) {
        try {
            // Read the code first.  It must not be consumed until the client
            // credentials, redirect URI and PKCE verifier have all passed.
            // The final compare-and-set below still prevents replay races.
            const authCode = await AuthorizationCode.findOne({
                code,
                usedAt: null,
                expiresAt: { $gt: new Date() }
            }).populate('userId');

            if (!authCode) {
                await securityAuditService.logSecurityEvent({
                    userId: null,
                    action: 'token_exchange_failed',
                    status: 'failure',
                    metadata: { reason: 'invalid_code', clientId }
                });
                throw new Error('Invalid or expired authorization code');
            }

            // 2) Validate client
            const client = await this.validateClient(clientId, clientSecret, redirectUri);
            if (!client) {
                logger.warn('exchangeCodeForTokens: client validation failed', { clientId });
                await securityAuditService.logSecurityEvent({
                    userId: authCode.userId?._id,
                    action: 'client_auth_failed',
                    status: 'failure',
                    metadata: { reason: 'invalid_client', clientId }
                });
                throw new Error('Invalid client credentials');
            }

            if (client.application_type !== 'web' ||
                !authCode.code_challenge ||
                authCode.code_challenge_method !== 'S256') {
                throw new Error('PKCE is required for this client');
            }

            // 3) Check code belongs to client before consuming it
            if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
                throw new Error('Authorization code does not match client');
            }

            // 4) PKCE verification
            if (authCode.code_challenge) {
                if (!codeVerifier) {
                    await securityAuditService.logSecurityEvent({
                        userId: authCode.userId?._id,
                        action: 'pkce_verification_failed',
                        status: 'failure',
                        metadata: { reason: 'pkce_verifier_missing', clientId }
                    });
                    throw new Error('code_verifier is required');
                }
                const isValid = this.verifyPKCE(
                    codeVerifier,
                    authCode.code_challenge,
                    authCode.code_challenge_method
                );
                if (!isValid) {
                    logger.warn('PKCE verification failed', { clientId });
                    await securityAuditService.logSecurityEvent({
                        userId: authCode.userId?._id,
                        action: 'pkce_verification_failed',
                        status: 'failure',
                        metadata: { reason: 'pkce_failed', clientId }
                    });
                    throw new Error('Invalid code_verifier');
                }
            }

            const user = authCode.userId;
            if (!user || !user.isActive) {
                throw new Error('User not found or inactive');
            }
            if (!authCode.grantId ||
                !await this.isGrantActive(user._id, clientId, authCode.grantId, authCode.scope)) {
                throw new Error('OAuth grant is inactive');
            }

            // 5) Consume only after all checks pass.  If another request won
            // the race, this request must fail without issuing tokens.
            const consumedCode = await AuthorizationCode.findOneAndUpdate(
                { _id: authCode._id, usedAt: null, expiresAt: { $gt: new Date() } },
                { $set: { usedAt: new Date() } },
                { new: false }
            );
            if (!consumedCode) {
                throw new Error('Invalid or expired authorization code');
            }

            // 6) Generate tokens
            const scopes = parseScopes(authCode.scope);
            const access_token = this.generateAccessToken(user, clientId, authCode.scope, authCode.grantId);
            const id_token = this.generateIdToken(user, clientId, authCode.scope, authCode.nonce);
            const tokenResponse = {
                access_token,
                id_token,
                token_type: 'Bearer',
                expires_in: 3600,
                scope: authCode.scope
            };
            if (scopes.has('offline_access')) {
                tokenResponse.refresh_token = this.generateRefreshToken(user, clientId, authCode.scope, authCode.grantId);
            }

            await client.incrementUsage();

            await securityAuditService.logSecurityEvent({
                userId: user._id,
                action: 'token_issued',
                status: 'success',
                metadata: { clientId, scope: authCode.scope }
            });

            logger.info('Authorization code exchanged for tokens', { clientId, userId: user._id });

            return tokenResponse;
        } catch (error) {
            logger.error('exchangeCodeForTokens failed:', error.message);
            throw error;
        }
    }

    // ─────────────────────────────────────────
    // Client Management
    // ─────────────────────────────────────────

    async registerClient(clientData, ownerId) {
        try {
            const client_id     = crypto.randomBytes(16).toString('hex');
            const client_secret = crypto.randomBytes(32).toString('hex');
            const registeredScope = clientData.scope || 'openid profile email';
            const grantTypes = parseScopes(registeredScope).has('offline_access')
                ? ['authorization_code', 'refresh_token']
                : ['authorization_code'];

            const client = new Client({
                client_id,
                client_secret,
                client_name:      clientData.client_name,
                description:      clientData.description,
                logo_uri:         clientData.logo_uri,
                redirect_uris:    clientData.redirect_uris,
                application_type: 'web',
                contact_email:    clientData.contact_email,
                owner:            ownerId,
                scope:            registeredScope,
                grant_types:      grantTypes,
                response_types:   ['code']
            });

            await client.save();

            return {
                client_id,
                client_secret, // Only time it's shown
                client_name: client.client_name,
                scope:       client.scope,
                application_type: client.application_type,
                grant_types: client.grant_types,
                response_types: client.response_types,
                created_at:  client.createdAt
            };
        } catch (error) {
            throw error;
        }
    }

    // Developer Portal only (ต้องมี owner)
    async getClient(clientId, ownerId) {
        try {
            const client = await Client.findOne({
                client_id: clientId,
                owner: ownerId
            });
            if (!client) throw new Error('Client not found');
            return client;
        } catch (error) {
            throw error;
        }
    }

    async listClients(ownerId, page = 1, limit = 10) {
        try {
            const skip = (page - 1) * limit;
            const clients = await Client.find({ owner: ownerId, isActive: true })
                .select('-client_secret')
                .sort('-createdAt')
                .skip(skip)
                .limit(limit);
            const total = await Client.countDocuments({ owner: ownerId, isActive: true });
            return {
                clients,
                pagination: {
                    page, limit, total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            throw error;
        }
    }

    async updateClient(clientId, updateData, ownerId) {
        try {
            const client = await Client.findOne({ client_id: clientId, owner: ownerId });
            if (!client) throw new Error('Client not found');

            const allowedUpdates = ['client_name', 'description', 'logo_uri', 'redirect_uris', 'contact_email'];
            allowedUpdates.forEach(field => {
                if (updateData[field] !== undefined) client[field] = updateData[field];
            });

            await client.save();
            return client;
        } catch (error) {
            throw error;
        }
    }

    async deleteClient(clientId, ownerId) {
        try {
            const client = await Client.findOne({ client_id: clientId, owner: ownerId });
            if (!client) throw new Error('Client not found');
            client.isActive = false;
            await client.save();
            await Consent.revokeAllForClient(clientId, 'client_deactivated');
            return { message: 'Client deactivated successfully' };
        } catch (error) {
            throw error;
        }
    }    // Validate Client (OAuth Flow - ไม่มี owner)
    // ─────────────────────────────────────────

    async validateClient(clientId, clientSecret, redirectUri) {
        try {
            const client = await Client.findOne({ client_id: clientId })
                .select('+client_secret');

            if (!client) {
                logger.warn('validateClient: client not found', { clientId });
                return null;
            }

            if (!client.isActive) {
                logger.warn('validateClient: client inactive', { clientId });
                return null;
            }
            if (client.application_type !== 'web' ||
                !Array.isArray(client.grant_types) ||
                !client.grant_types.includes('authorization_code')) {
                logger.warn('validateClient: unsupported application or grant type', { clientId });
                return null;
            }

            // RFC 9700 requires exact redirect URI matching. Case and trailing
            // slash differences identify different callbacks.
            const hasMatch = client.redirect_uris.includes(redirectUri);

            if (!hasMatch) {
                logger.warn('validateClient: redirect_uri mismatch', { clientId });
                return null;
            }

            const isValid = await client.compareSecret(clientSecret);
            if (!isValid) {
                logger.warn('validateClient: secret mismatch', { clientId });
                return null;
            }

            return client;
        } catch (error) {
            throw error;
        }
    }

    // ─────────────────────────────────────────
    async isGrantActive(userId, clientId, grantId, scope) {
        if (!userId || !clientId || !grantId) return false;

        const [user, client, consent] = await Promise.all([
            User.findById(userId).select('_id isActive'),
            Client.findOne({ client_id: clientId, isActive: true }).select('_id'),
            Consent.findOne({
                userId,
                clientId,
                grantId,
                revokedAt: null,
                expiresAt: { $gt: new Date() }
            }).select('scope grantId')
        ]);

        if (!user?.isActive || !client || !consent) return false;

        const approvedScopes = new Set(String(consent.scope || '').split(/\s+/).filter(Boolean));
        return String(scope || '')
            .split(/\s+/)
            .filter(Boolean)
            .every((requested) => approvedScopes.has(requested));
    }
    // Token Generation
    // ─────────────────────────────────────────

    generateAccessToken(user, clientId, scope, grantId = null) {
        const baseUrl = config.BASE_URL || 'http://localhost:5000';
        const claims = {
            sub:       user._id.toString(),
            client_id: clientId,
            scope,
            type:      'access_token',
            jti:       crypto.randomBytes(16).toString('hex')
        };
        if (grantId) claims.grant_id = String(grantId);

        return jwt.sign(
            claims,
            oidcKeys.privateKey,
            { algorithm: 'RS256', keyid: oidcKeys.keyId, expiresIn: '1h', issuer: baseUrl, audience: clientId }
        );
    }

    generateIdToken(user, clientId, scope = '', nonce = null) {
        const baseUrl = config.BASE_URL || 'http://localhost:5000';
        const now = Math.floor(Date.now() / 1000);
        const scopes = parseScopes(scope);
        const claims = {
            sub: user._id.toString(),
            aud: clientId,
            iss: baseUrl,
            iat: now,
            exp: now + 3600,
            type: 'id_token'
        };

        if (nonce) claims.nonce = nonce;

        if (scopes.has('email')) claims.email = user.email;
        if (scopes.has('profile')) {
            claims.username = user.username;
            claims.name = user.username;
        }

        return jwt.sign(claims, oidcKeys.privateKey, {
            algorithm: 'RS256',
            keyid: oidcKeys.keyId
        });
    }

    generateRefreshToken(user, clientId, scope, grantId = null) {
        const scopes = parseScopes(scope);
        if (!scopes.has('offline_access')) {
            throw new Error('offline_access is required for refresh tokens');
        }

        const baseUrl = config.BASE_URL || 'http://localhost:5000';
        const claims = {
            sub:       user._id.toString(),
            client_id: clientId,
            scope,
            type:      'refresh_token',
            jti:       crypto.randomBytes(16).toString('hex')
        };
        if (grantId) claims.grant_id = String(grantId);

        return jwt.sign(
            claims,
            config.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '30d', issuer: baseUrl, audience: clientId }
        );
    }
    // ─────────────────────────────────────────

    async refreshAccessToken(refreshToken) {
        try {
            const baseUrl = config.BASE_URL || 'http://localhost:5000';
            const decoded = jwt.verify(refreshToken, config.JWT_SECRET, {
                algorithms: ['HS256'],
                issuer: baseUrl
            });

            if (decoded.type !== 'refresh_token') throw new Error('Invalid token type');
            if (!decoded.grant_id) throw new Error('OAuth grant is inactive');
            if (!parseScopes(decoded.scope).has('offline_access')) {
                throw new Error('Refresh token is not authorized for offline access');
            }

            const audiences = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
            if (!decoded.client_id || !audiences.includes(decoded.client_id)) {
                throw new Error('Refresh token audience is invalid');
            }

            const user = await User.findById(decoded.sub);
            if (!user || !user.isActive) throw new Error('User not found or inactive');

            if (!await this.isGrantActive(decoded.sub, decoded.client_id, decoded.grant_id, decoded.scope)) {
                throw new Error('OAuth grant is inactive');
            }

            // Unique token hashes make consumption atomic: at most one
            // concurrent refresh request can issue a successor token.
            const consumed = await TokenBlacklist.consumeToken(
                refreshToken,
                user._id,
                decoded.client_id,
                'token_rotation'
            );
            if (!consumed) throw new Error('Token has been revoked');

            const access_token = this.generateAccessToken(
                user, decoded.client_id, decoded.scope, decoded.grant_id
            );
            const new_refresh = this.generateRefreshToken(
                user, decoded.client_id, decoded.scope, decoded.grant_id
            );

            logger.info('OAuth token refreshed', { userId: user._id, clientId: decoded.client_id });
            return {
                access_token,
                refresh_token: new_refresh,
                token_type: 'Bearer',
                scope: decoded.scope,
                expires_in: 3600
            };
        } catch (error) {
            logger.error('refreshAccessToken failed:', error.message);
            throw error;
        }
    }

    async verifyAccessToken(token) {
        try {
            const isBlacklisted = await TokenBlacklist.isBlacklisted(token);
            if (isBlacklisted) throw new Error('Token has been revoked');

            const baseUrl = config.BASE_URL || 'http://localhost:5000';
            const decoded = jwt.verify(token, oidcKeys.publicKey, {
                algorithms: ['RS256'],
                issuer: baseUrl
            });
            if (decoded.type !== 'access_token') throw new Error('Invalid token type');
            if (!decoded.grant_id) throw new Error('OAuth grant is inactive');
            const audiences = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
            if (!decoded.client_id || !audiences.includes(decoded.client_id)) {
                throw new Error('Invalid access token audience');
            }

            if (!await this.isGrantActive(decoded.sub, decoded.client_id, decoded.grant_id, decoded.scope)) {
                throw new Error('OAuth grant is inactive');
            }

            return decoded;
        } catch (error) {
            throw error;
        }
    }

    async getUserInfo(token) {
        try {
            // UserInfo accepts only a live OAuth access token.
            const decoded = await this.verifyAccessToken(token);
            if (!decoded.client_id || typeof decoded.scope !== 'string') {
                throw new Error('Invalid OAuth access token');
            }

            const userId = decoded.sub;
            if (!userId) throw new Error('Token does not contain user ID');

            const user = await User.findById(userId);
            if (!user || !user.isActive) throw new Error('User not found or inactive');

            const scopes = parseScopes(decoded.scope);
            const userInfo = { sub: user._id.toString() };
            if (scopes.has('email')) userInfo.email = user.email;
            if (scopes.has('profile')) {
                userInfo.username = user.username;
                userInfo.name = user.username;
            }
            return userInfo;
        } catch (error) {
            throw error;
        }
    }

    verifyRevocableToken(token, expectedClientId) {
        const unverified = jwt.decode(token);
        if (!unverified || !expectedClientId || unverified.client_id !== expectedClientId) {
            throw new Error('Invalid OAuth token');
        }

        const baseUrl = config.BASE_URL || 'http://localhost:5000';
        const verification = {
            issuer: baseUrl,
            audience: expectedClientId
        };
        let decoded;
        if (unverified.type === 'access_token') {
            decoded = jwt.verify(token, oidcKeys.publicKey, {
                ...verification,
                algorithms: ['RS256']
            });
        } else if (unverified.type === 'refresh_token') {
            decoded = jwt.verify(token, config.JWT_SECRET, {
                ...verification,
                algorithms: ['HS256']
            });
        } else {
            throw new Error('Unsupported OAuth token type');
        }

        if (!decoded.sub || decoded.client_id !== expectedClientId) {
            throw new Error('Invalid OAuth token claims');
        }
        return decoded;
    }

    async revokeToken(token, userId, reason = 'user_logout', expectedClientId = null) {
        try {
            const decoded = this.verifyRevocableToken(token, expectedClientId);
            if (String(decoded.sub) !== String(userId)) {
                throw new Error('OAuth token subject mismatch');
            }

            await TokenBlacklist.revokeToken(token, userId, decoded.client_id, reason);
            return { message: 'Token revoked successfully' };
        } catch (error) {
            throw error;
        }
    }

    async introspectToken(token) {
        try {
            const decoded = await this.verifyAccessToken(token);
            return {
                active:    true,
                sub:       decoded.sub,
                client_id: decoded.client_id,
                scope:     decoded.scope,
                exp:       decoded.exp,
                iat:       decoded.iat
            };
        } catch (error) {
            return { active: false };
        }
    }
}

module.exports = new OAuthService();
