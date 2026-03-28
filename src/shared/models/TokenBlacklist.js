const mongoose = require('mongoose');

const tokenBlacklistSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    tokenType: {
        type: String,
        enum: ['access_token', 'refresh_token', 'authorization_code'],
        default: 'access_token'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    clientId: {
        type: String,
        index: true
    },
    reason: {
        type: String,
        enum: ['user_logout', 'admin_revoke', 'security_breach', 'expired'],
        default: 'user_logout'
    },
    revokedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // TTL index - auto delete after expiry
    }
});

// Static method to check if token is blacklisted
tokenBlacklistSchema.statics.isBlacklisted = async function(token) {
    const entry = await this.findOne({ token });
    return !!entry;
};

// Static method to revoke token
tokenBlacklistSchema.statics.revokeToken = async function(token, userId, clientId, reason = 'user_logout') {
    const jwt = require('jsonwebtoken');
    
    try {
        // Decode token to get expiry (don't verify, just decode)
        const decoded = jwt.decode(token);
        
        if (!decoded || !decoded.exp) {
            throw new Error('Invalid token format');
        }

        // Ensure expiresAt is always in the future so the TTL index doesn't delete the entry immediately
        const expiresAt = new Date(Math.max(decoded.exp * 1000, Date.now() + 60000));

        return await this.findOneAndUpdate(
            { token },
            { $setOnInsert: { token, userId, clientId, reason, expiresAt } },
            { upsert: true, new: true }
        );
    } catch (error) {
        throw error;
    }
};

tokenBlacklistSchema.set('timestamps', true);

module.exports = mongoose.model('TokenBlacklist', tokenBlacklistSchema);