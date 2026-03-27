const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Client = require('../../../shared/models/Client');
const User = require('../../../shared/models/User');
const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
const AuthorizationCode = require('../../../shared/models/AuthorizationCode');
const Session = require('../../../shared/models/Session');
const config = require('../../../shared/config/config');
const sessionService = require('../../../shared/services/session.service');

class OAuthService {

    // ─────────────────────────────────────────
    // Authorization Code
    // ─────────────────────────────────────────

    async generateAuthorizationCode(userId, clientId, redirectUri, scope, pkce = null) {
        try {
            const code = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            const authCodeData = {
                code,
                clientId,
                userId,
                redirectUri,
                scope,
                expiresAt
            };

            if (pkce && pkce.code_challenge) {
                authCodeData.code_challenge = pkce.code_challenge;
                authCodeData.code_challenge_method = pkce.code_challenge_method || 'S256';
            }

            await AuthorizationCode.create(authCodeData);

            console.log('=== Authorization Code Created ===');
            console.log('code_challenge        :', authCodeData.code_challenge || 'NONE');
            console.log('code_challenge_method :', authCodeData.code_challenge_method || 'NONE');
            console.log('==================================');

            return code;
        } catch (error) {
            throw error;
        }
    }

    // ─────────────────────────────────────────
    // PKCE Verification
    // ─────────────────────────────────────────

    verifyPKCE(codeVerifier, codeChallenge, method = 'S256') {
        if (method === 'S256') {
            const hash = crypto
                .createHash('sha256')
                .update(codeVerifier)
                .digest('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
            return hash === codeChallenge;
        }

        if (method === 'plain') {
            return codeVerifier === codeChallenge;
        }

        return false;
    }

    // ─────────────────────────────────────────
    // Exchange Code for Tokens
    // ─────────────────────────────────────────

    async exchangeCodeForTokens(code, clientId, clientSecret, redirectUri, codeVerifier = null) {
        try {
            // 1) Find authorization code
            const authCode = await AuthorizationCode.findOne({
                code,
                used: false,
                expiresAt: { $gt: new Date() }
            }).populate('userId');

            if (!authCode) {
                throw new Error('Invalid or expired authorization code');
            }

            console.log('=== PKCE Check ===');
            console.log('code_challenge in DB    :', authCode.code_challenge);
            console.log('code_challenge_method   :', authCode.code_challenge_method);
            console.log('code_verifier received  :', codeVerifier);
            console.log('==================');

            // 2) PKCE verification
            if (authCode.code_challenge) {
                if (!codeVerifier) {
                    throw new Error('code_verifier is required');
                }
                const isValid = this.verifyPKCE(
                    codeVerifier,
                    authCode.code_challenge,
                    authCode.code_challenge_method
                );
                console.log('PKCE valid:', isValid);
                if (!isValid) {
                    throw new Error('Invalid code_verifier');
                }
            }

            // 3) Validate client
            const client = await this.validateClient(clientId, clientSecret, redirectUri);
            if (!client) {
                // ⭐ Log เพื่อ debug ว่าตรงไหนที่ไม่ผ่าน
                const debugClient = await Client.findOne({ client_id: clientId });
                console.log('=== validateClient failed ===');
                console.log('client exists         :', !!debugClient);
                console.log('client isActive       :', debugClient?.isActive);
                console.log('redirect_uris in DB   :', debugClient?.redirect_uris);
                console.log('redirect_uri received :', redirectUri);
                console.log('=============================');
                throw new Error('Invalid client credentials');
            }

            // 4) Check code belongs to client
            if (authCode.clientId !== clientId) {
                throw new Error('Authorization code does not match client');
            }

            // 5) Mark code as used
            await authCode.markAsUsed();

            // 6) Generate tokens
            const user = authCode.userId;
            const access_token  = this.generateAccessToken(user, clientId, authCode.scope);
            const id_token      = this.generateIdToken(user, clientId);
            const refresh_token = this.generateRefreshToken(user, clientId);

            await client.incrementUsage();

            return {
                access_token,
                id_token,
                refresh_token,
                token_type: 'Bearer',
                expires_in: 3600,
                scope: authCode.scope
            };
        } catch (error) {
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

            const client = new Client({
                client_id,
                client_secret,
                client_name:      clientData.client_name,
                description:      clientData.description,
                logo_uri:         clientData.logo_uri,
                redirect_uris:    clientData.redirect_uris,
                application_type: clientData.application_type || 'web',
                contact_email:    clientData.contact_email,
                owner:            ownerId,
                scope:            clientData.scope || 'openid profile email'
            });

            await client.save();

            return {
                client_id,
                client_secret, // Only time it's shown
                client_name: client.client_name,
                scope:       client.scope,
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
            const clients = await Client.find({ owner: ownerId, isActive: { $ne: false } })
                .select('-client_secret')
                .sort('-createdAt')
                .skip(skip)
                .limit(limit);
            const total = await Client.countDocuments({ owner: ownerId, isActive: { $ne: false } });
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
            return { message: 'Client deactivated successfully' };
        } catch (error) {
            throw error;
        }
    }

    // ─────────────────────────────────────────
    // Validate Client (OAuth Flow - ไม่มี owner)
    // ─────────────────────────────────────────

    async validateClient(clientId, clientSecret, redirectUri) {
        try {
            const client = await Client.findOne({ client_id: clientId })
                .select('+client_secret');

            if (!client) {
                console.log('validateClient: client not found:', clientId);
                return null;
            }

            if (!client.isActive) {
                console.log('validateClient: client inactive');
                return null;
            }

            // ⭐ Normalize URL ก่อนเปรียบเทียบ (ป้องกัน trailing slash)
            const normalizeUrl = (url) => url?.replace(/\/$/, '').toLowerCase().trim();
            const receivedUri  = normalizeUrl(redirectUri);
            const hasMatch     = client.redirect_uris.some(
                uri => normalizeUrl(uri) === receivedUri
            );

            if (!hasMatch) {
                console.log('validateClient: redirect_uri mismatch');
                console.log('  received :', redirectUri);
                console.log('  allowed  :', client.redirect_uris);
                return null;
            }

            const isValid = await client.compareSecret(clientSecret);
            if (!isValid) {
                console.log('validateClient: secret mismatch');
                return null;
            }

            return client;
        } catch (error) {
            throw error;
        }
    }

    // ─────────────────────────────────────────
    // Token Generation
    // ─────────────────────────────────────────

    generateAccessToken(user, clientId, scope) {
    const baseUrl = config.BASE_URL || 'http://localhost:5000'; // ✅ เพิ่ม
    return jwt.sign(
        {
            sub:       user._id.toString(),
            email:     user.email,
            username:  user.username,
            role:      user.role,
            client_id: clientId,
            scope,
            type:      'access_token'
        },
        config.JWT_SECRET,
        { expiresIn: '1h', issuer: baseUrl, audience: clientId } // ✅ แก้
    );
}

    generateIdToken(user, clientId) {
    const baseUrl = config.BASE_URL || 'http://localhost:5000'; // ✅ เพิ่ม
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
        {
            sub:            user._id.toString(),
            email:          user.email,
            email_verified: true,
            username:       user.username,
            name:           user.username,
            aud:            clientId,
            iss:            baseUrl,                             // ✅ แก้
            iat:            now,
            exp:            now + 3600,
            type:           'id_token'
        },
        config.JWT_SECRET
    );
}

// ─── เปลี่ยน generateRefreshToken ────────────────────────────────
generateRefreshToken(user, clientId) {
    const baseUrl = config.BASE_URL || 'http://localhost:5000'; // ✅ เพิ่ม
    return jwt.sign(
        {
            sub:       user._id.toString(),
            client_id: clientId,
            type:      'refresh_token'
        },
        config.JWT_SECRET,
        { expiresIn: '30d', issuer: baseUrl, audience: clientId } // ✅ แก้
    );
}


    // ─────────────────────────────────────────
    // Token Operations
    // ─────────────────────────────────────────

    async refreshAccessToken(refreshToken, req) {
        try {
            const decoded = jwt.verify(refreshToken, config.JWT_SECRET);
            if (decoded.type !== 'refresh_token') throw new Error('Invalid token type');

            const isBlacklisted = await TokenBlacklist.isBlacklisted(refreshToken);
            if (isBlacklisted) throw new Error('Token has been revoked');

            const user = await User.findById(decoded.sub);
            if (!user || !user.isActive) throw new Error('User not found or inactive');

            // If session tracking is available, validate and rotate
            if (req?.sessionToken) {
                const sessionValidation = await sessionService.validateAndRotateRefreshToken(
                    req.sessionToken,
                    refreshToken
                );

                if (!sessionValidation.valid) {
                    if (sessionValidation.compromised) {
                        throw new Error('Session compromised - all sessions revoked');
                    }
                    throw new Error('Invalid session');
                }

                // Generate new refresh token (rotation)
                const newRefreshToken = this.generateRefreshToken(user, decoded.client_id);
                
                // Update session with new refresh token
                await sessionService.updateRefreshToken(req.sessionToken, newRefreshToken);

                const access_token = this.generateAccessToken(
                    user, decoded.client_id, 'openid profile email'
                );

                return {
                    access_token,
                    refresh_token: newRefreshToken, // New refresh token
                    token_type: 'Bearer',
                    expires_in: 3600
                };
            }

            // Fallback without session tracking
            const access_token = this.generateAccessToken(
                user, decoded.client_id, 'openid profile email'
            );

            return { access_token, token_type: 'Bearer', expires_in: 3600 };
        } catch (error) {
            throw error;
        }
    }

    async verifyAccessToken(token) {
        try {
            const isBlacklisted = await TokenBlacklist.isBlacklisted(token);
            if (isBlacklisted) throw new Error('Token has been revoked');

            const decoded = jwt.verify(token, config.JWT_SECRET);
            if (decoded.type !== 'access_token') throw new Error('Invalid token type');

            return decoded;
        } catch (error) {
            throw error;
        }
    }

    async getUserInfo(token) {
        try {
            let decoded;
            try {
                decoded = jwt.verify(token, config.JWT_SECRET);
            } catch (err) {
                throw new Error('Invalid or expired token');
            }

            const userId = decoded.id || decoded.sub;
            if (!userId) throw new Error('Token does not contain user ID');

            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');

            return {
                sub:            user._id.toString(),
                email:          user.email,
                email_verified: true,
                username:       user.username,
                name:           user.username,
                role:           user.role,
                created_at:     user.createdAt,
                updated_at:     user.updatedAt
            };
        } catch (error) {
            throw error;
        }
    }

    async revokeToken(token, userId, reason = 'user_logout') {
        try {
            const decoded = jwt.decode(token);
            if (!decoded) throw new Error('Invalid token');

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