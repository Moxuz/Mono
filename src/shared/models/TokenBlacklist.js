const mongoose = require('mongoose');
const crypto = require('crypto');

// token field stores SHA256 hash of the raw JWT — never the raw token itself
const tokenBlacklistSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    tokenType: {
        type: String,
        enum: ['access_token', 'refresh_token'],
        default: 'access_token'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    clientId: {
        type: String,
        default: null  // nullable — local login tokens have no clientId
    },
    reason: {
        type: String,
        enum: [
            'user_logout',
            'admin_revoke',
            'security_breach',
            'token_rotation',
            'password_changed',
            'account_deleted',
            'expired'
        ],
        default: 'user_logout'
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // TTL index - auto delete after expiry
    }
});

// Hash raw token — used internally so DB always stores hashes
function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Check if a raw token is blacklisted (hashes before lookup)
tokenBlacklistSchema.statics.isBlacklisted = async function(rawToken) {
    const hash = hashToken(rawToken);
    const entry = await this.findOne({ token: hash });
    return !!entry;
};

// Revoke a raw token — decodes JWT for expiry, stores hash
tokenBlacklistSchema.statics.revokeToken = async function(rawToken, userId, clientId, reason = 'user_logout') {
    const jwt = require('jsonwebtoken');

    const decoded = jwt.decode(rawToken);
    if (!decoded || !decoded.exp) {
        throw new Error('Invalid token format');
    }

    const expiresAt = new Date(Math.max(decoded.exp * 1000, Date.now() + 60000));
    const hash = hashToken(rawToken);
    const tokenType = decoded.type === 'refresh_token' ? 'refresh_token' : 'access_token';

    return await this.findOneAndUpdate(
        { token: hash },
        { $setOnInsert: { token: hash, tokenType, userId, clientId: clientId || null, reason, expiresAt } },
        { upsert: true, new: true }
    );
};

// Atomically consume a one-time token. A unique-index collision means another
// request already used or revoked the same token, so callers must issue no new
// credentials. This closes concurrent refresh-token replay races.
tokenBlacklistSchema.statics.consumeToken = async function(rawToken, userId, clientId, reason = 'token_rotation') {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(rawToken);
    if (!decoded || !decoded.exp) throw new Error('Invalid token format');

    try {
        await this.create({
            token: hashToken(rawToken),
            tokenType: decoded.type === 'refresh_token' ? 'refresh_token' : 'access_token',
            userId,
            clientId: clientId || null,
            reason,
            expiresAt: new Date(Math.max(decoded.exp * 1000, Date.now() + 60000))
        });
        return true;
    } catch (error) {
        if (error?.code === 11000) return false;
        throw error;
    }
};

// Revoke by hash directly — used when the raw token is no longer available
// (e.g. revoke session refresh token stored only as refreshTokenHash)
tokenBlacklistSchema.statics.revokeByHash = async function(hash, userId, clientId, reason = 'user_logout', expiresAt) {
    const exp = expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30d default
    return await this.findOneAndUpdate(
        { token: hash },
        { $setOnInsert: { token: hash, userId, clientId: clientId || null, reason, expiresAt: exp } },
        { upsert: true, new: true }
    );
};

tokenBlacklistSchema.set('timestamps', true);

module.exports = mongoose.model('TokenBlacklist', tokenBlacklistSchema);
