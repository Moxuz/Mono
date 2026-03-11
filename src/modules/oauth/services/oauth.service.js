  const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Client = require('../../../shared/models/Client');
const User = require('../../../shared/models/User');
const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
const AuthorizationCode = require('../../../shared/models/AuthorizationCode');
const config = require('../../../shared/config/config');

class OAuthService {


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

            // ✅ ถ้ามี PKCE ให้เก็บ code_challenge ไว้
            if (pkce && pkce.code_challenge) {
                authCodeData.code_challenge = pkce.code_challenge;
                authCodeData.code_challenge_method = pkce.code_challenge_method || 'S256';
            }

            await AuthorizationCode.create(authCodeData);

            return code;
        } catch (error) {
            throw error;
        }
    }

    /**
     * ✅ ตรวจสอบ PKCE
     */
    verifyPKCE(codeVerifier, codeChallenge, method = 'S256') {
        if (method === 'S256') {
            // SHA256(code_verifier) แล้ว Base64URL encode
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

    /**
     * Exchange authorization code for tokens
     * ✅ เพิ่ม PKCE verification
     */
    async exchangeCodeForTokens(code, clientId, clientSecret, redirectUri, codeVerifier = null) {
        try {
            // Find authorization code
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

            // ✅ ตรวจสอบ PKCE
            if (authCode.code_challenge) {
                // ถ้า code มี challenge → ต้องส่ง verifier มาด้วย
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

            // Validate client
            const client = await this.validateClient(clientId, clientSecret, redirectUri);
            if (!client) {
                throw new Error('Invalid client credentials');
            }

            // Check if code matches client
            if (authCode.clientId !== clientId) {
                throw new Error('Authorization code does not match client');
            }

            // Mark code as used
            await authCode.markAsUsed();

            // Get user
            const user = authCode.userId;

            // Generate tokens
            const access_token = this.generateAccessToken(user, clientId, authCode.scope);
            const id_token = this.generateIdToken(user, clientId);
            const refresh_token = this.generateRefreshToken(user, clientId);

            // Update client stats
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



    /**
     * Register new OAuth client
     */
    async registerClient(clientData, ownerId) {
        try {
            // Generate credentials
            const client_id = crypto.randomBytes(16).toString('hex');
            const client_secret = crypto.randomBytes(32).toString('hex');

            // Create client (password will be hashed by pre-save hook)
            const client = new Client({
                client_id,
                client_secret, // Will be hashed
                client_name: clientData.client_name,
                description: clientData.description,
                logo_uri: clientData.logo_uri,
                redirect_uris: clientData.redirect_uris,
                application_type: clientData.application_type || 'web',
                contact_email: clientData.contact_email,
                owner: ownerId,
                scope: clientData.scope || 'openid profile email'
            });

            await client.save();

            // Return plain client_secret (only time it's shown)
            return {
                client_id,
                client_secret, // Plain text - save this!
                client_name: client.client_name,
                created_at: client.createdAt
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get client by ID
     */
    async getClient(clientId, ownerId) {
        try {
            const client = await Client.findOne({ 
                client_id: clientId,
                owner: ownerId 
            });

            if (!client) {
                throw new Error('Client not found');
            }

            return client;
        } catch (error) {
            throw error;
        }
    }

    /**
     * List all clients for owner
     */
    async listClients(ownerId, page = 1, limit = 10) {
        try {
            const skip = (page - 1) * limit;

            const clients = await Client.find({ owner: ownerId })
                .select('-client_secret')
                .sort('-createdAt')
                .skip(skip)
                .limit(limit);

            const total = await Client.countDocuments({ owner: ownerId });

            return {
                clients,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Update client
     */
    async updateClient(clientId, updateData, ownerId) {
        try {
            const client = await Client.findOne({ 
                client_id: clientId,
                owner: ownerId 
            });

            if (!client) {
                throw new Error('Client not found');
            }

            // Update allowed fields
            const allowedUpdates = ['client_name', 'description', 'logo_uri', 'redirect_uris', 'contact_email'];
            allowedUpdates.forEach(field => {
                if (updateData[field] !== undefined) {
                    client[field] = updateData[field];
                }
            });

            await client.save();
            return client;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Delete (deactivate) client
     */
    async deleteClient(clientId, ownerId) {
        try {
            const client = await Client.findOne({ 
                client_id: clientId,
                owner: ownerId 
            });

            if (!client) {
                throw new Error('Client not found');
            }

            client.isActive = false;
            await client.save();

            return { message: 'Client deactivated successfully' };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Validate client credentials
     */
    async validateClient(clientId, clientSecret, redirectUri) {
        try {
            const client = await Client.findOne({ client_id: clientId })
                .select('+client_secret');

            if (!client) {
                return null;
            }

            // Check if active
            if (!client.isActive) {
                return null;
            }

            // Check redirect URI
            if (!client.redirect_uris.includes(redirectUri)) {
                return null;
            }

            // Verify secret
            const isValid = await client.compareSecret(clientSecret);
            if (!isValid) {
                return null;
            }

            return client;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Generate authorization code
     */
    async generateAuthorizationCode(userId, clientId, redirectUri, scope, pkce = null) {
    try {
        const code = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

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

        // ✅ เพิ่ม log ตรงนี้
        console.log('=== Authorization Code Created ===');
        console.log('code_challenge        :', authCodeData.code_challenge || 'NONE (No PKCE)');
        console.log('code_challenge_method :', authCodeData.code_challenge_method || 'NONE');
        console.log('==================================');

        return code;
    } catch (error) {
        throw error;
    }
}
    /**
     * Exchange authorization code for tokens
     */
    async exchangeCodeForTokens(code, clientId, clientSecret, redirectUri, codeVerifier = null) {
    try {
        const authCode = await AuthorizationCode.findOne({ 
            code,
            used: false,
            expiresAt: { $gt: new Date() }
        }).populate('userId');

        if (!authCode) {
            throw new Error('Invalid or expired authorization code');
        }

        console.log('=== PKCE Check ===');
        console.log('code_challenge in DB :', authCode.code_challenge);
        console.log('code_verifier received:', codeVerifier);
        console.log('==================');

        // ✅ PKCE verification
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

        // Validate client
        const client = await this.validateClient(clientId, clientSecret, redirectUri);
        if (!client) {
            throw new Error('Invalid client credentials');
        }

        if (authCode.clientId !== clientId) {
            throw new Error('Authorization code does not match client');
        }

        await authCode.markAsUsed();

        const user = authCode.userId;

        const access_token = this.generateAccessToken(user, clientId, authCode.scope);
        const id_token = this.generateIdToken(user, clientId);
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
    /**
     * Generate access token
     */
    generateAccessToken(user, clientId, scope) {
        const payload = {
            sub: user._id.toString(),
            email: user.email,
            username: user.username,
            role: user.role,
            client_id: clientId,
            scope: scope,
            type: 'access_token'
        };

        return jwt.sign(payload, config.JWT_SECRET, { 
            expiresIn: '1h',
            issuer: 'http://localhost:5000',
            audience: clientId
        });
    }

    /**
     * Generate ID token (OIDC)
     */
    generateIdToken(user, clientId) {
        const now = Math.floor(Date.now() / 1000);

        const payload = {
            sub: user._id.toString(),
            email: user.email,
            email_verified: true,
            username: user.username,
            name: user.username,
            aud: clientId,
            iss: 'http://localhost:5000',
            iat: now,
            exp: now + 3600,
            type: 'id_token'
        };

        return jwt.sign(payload, config.JWT_SECRET);
    }

    /**
     * Generate refresh token
     */
    generateRefreshToken(user, clientId) {
        const payload = {
            sub: user._id.toString(),
            client_id: clientId,
            type: 'refresh_token'
        };

        return jwt.sign(payload, config.JWT_SECRET, { 
            expiresIn: '30d',
            issuer: 'http://localhost:5000',
            audience: clientId
        });
    }

    /**
     * Refresh access token
     */
    async refreshAccessToken(refreshToken) {
        try {
            // Verify refresh token
            const decoded = jwt.verify(refreshToken, config.JWT_SECRET);

            if (decoded.type !== 'refresh_token') {
                throw new Error('Invalid token type');
            }

            // Check if blacklisted
            const isBlacklisted = await TokenBlacklist.isBlacklisted(refreshToken);
            if (isBlacklisted) {
                throw new Error('Token has been revoked');
            }

            // Get user
            const user = await User.findById(decoded.sub);
            if (!user || !user.isActive) {
                throw new Error('User not found or inactive');
            }

            // Generate new access token
            const access_token = this.generateAccessToken(
                user, 
                decoded.client_id, 
                'openid profile email'
            );

            return {
                access_token,
                token_type: 'Bearer',
                expires_in: 3600
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Verify access token
     */
    async verifyAccessToken(token) {
        try {
            // Check if blacklisted
            const isBlacklisted = await TokenBlacklist.isBlacklisted(token);
            if (isBlacklisted) {
                throw new Error('Token has been revoked');
            }

            // Verify JWT
            const decoded = jwt.verify(token, config.JWT_SECRET);

            if (decoded.type !== 'access_token') {
                throw new Error('Invalid token type');
            }

            return decoded;
        } catch (error) {
            throw error;
        }
    }

   /**
 * Get user info from access token
 */
async getUserInfo(token) {
    try {
        const jwt = require('jsonwebtoken');
        const config = require('../../../shared/config/config');
        
        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, config.JWT_SECRET);
            console.log('Token decoded in getUserInfo:', decoded);
        } catch (err) {
            console.error('Token verification error:', err.message);
            throw new Error('Invalid or expired token');
        }

        // ✅ รองรับทั้ง token จาก login และ OAuth
        // เช็คว่ามี user ID ไหน (ไม่สนใจ type)
        const userId = decoded.id || decoded.sub;
        
        if (!userId) {
            throw new Error('Token does not contain user ID');
        }

        console.log('Looking up user:', userId);

        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        console.log('User found:', user.email);

        return {
            sub: user._id.toString(),
            email: user.email,
            email_verified: true,
            username: user.username,
            name: user.username,
            role: user.role,
            created_at: user.createdAt,
            updated_at: user.updatedAt
        };
    } catch (error) {
        console.error('getUserInfo error:', error.message);
        throw error;
    }
}

    /**
     * Revoke token
     */
    async revokeToken(token, userId, reason = 'user_logout') {
        try {
            const decoded = jwt.decode(token);
            
            if (!decoded) {
                throw new Error('Invalid token');
            }

            await TokenBlacklist.revokeToken(
                token,
                userId,
                decoded.client_id,
                reason
            );

            return { message: 'Token revoked successfully' };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Introspect token (check if valid)
     */
    async introspectToken(token) {
        try {
            const decoded = await this.verifyAccessToken(token);

            return {
                active: true,
                sub: decoded.sub,
                client_id: decoded.client_id,
                scope: decoded.scope,
                exp: decoded.exp,
                iat: decoded.iat
            };
        } catch (error) {
            return {
                active: false
            };
        }
    }
}

module.exports = new OAuthService();
