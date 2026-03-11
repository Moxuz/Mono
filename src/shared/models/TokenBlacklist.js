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

        return await this.create({
            token,
            userId,
            clientId,
            reason,
            expiresAt: new Date(decoded.exp * 1000)
        });
    } catch (error) {
        throw error;
    }
};

module.exports = mongoose.model('TokenBlacklist', tokenBlacklistSchema);