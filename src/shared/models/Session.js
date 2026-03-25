// src/shared/models/Session.js

const mongoose = require('mongoose');
const crypto = require('crypto');

const sessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sessionToken: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    refreshToken: {
        type: String,
        required: true,
        select: false
    },
    refreshTokenHash: {
        type: String,
        required: true,
        select: false
    },
    // Device/Browser info
    userAgent: {
        type: String
    },
    ipAddress: {
        type: String
    },
    deviceInfo: {
        browser: String,
        os: String,
        device: String
    },
    // Location (approximate from IP)
    location: {
        country: String,
        city: String
    },
    // Session status
    isActive: {
        type: Boolean,
        default: true
    },
    lastActiveAt: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 7776000 // 90 days TTL
    },
    // Refresh token family for rotation
    refreshTokenFamily: {
        type: String,
        default: () => crypto.randomBytes(16).toString('hex')
    },
    // If session was revoked
    revokedAt: {
        type: Date
    },
    revokeReason: {
        type: String,
        enum: ['user_logout', 'admin_revoke', 'security', 'token_compromised', 'password_change', 'expired']
    }
}, {
    timestamps: true
});

// ============================================
// INDEXES
// ============================================
sessionSchema.index({ userId: 1, isActive: -1 });
sessionSchema.index({ sessionToken: 1 });
sessionSchema.index({ refreshTokenFamily: 1 });
sessionSchema.index({ createdAt: 1 }); // For TTL cleanup

// ============================================
// STATIC METHODS (Utility)
// ============================================

/**
 * Generate random session token (for fallback use only)
 */
sessionSchema.statics.generateSessionToken = function() {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Hash refresh token
 */
sessionSchema.statics.hashRefreshToken = function(token) {
    if (!token) {
        throw new Error('Token is required for hashing');
    }
    return crypto.createHash('sha256').update(token).digest('hex');
};

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Check if session is expired
 */
sessionSchema.methods.isExpired = function() {
    const expiryTime = 90 * 24 * 60 * 60 * 1000; // 90 days
    return Date.now() - this.createdAt.getTime() > expiryTime;
};

/**
 * Update last active timestamp
 */
sessionSchema.methods.updateLastActive = async function() {
    this.lastActiveAt = new Date();
    await this.save();
};

/**
 * Revoke session
 */
sessionSchema.methods.revoke = async function(reason) {
    this.isActive = false;
    this.revokedAt = new Date();
    this.revokeReason = reason;
    await this.save();
};

// ============================================
// STATIC METHODS (CRUD Operations)
// ============================================

/**
 * Create new session
 * @param {Object} data - Session data
 * @param {String} data.userId - User ID
 * @param {String} data.sessionToken - JWT access token (will be used as sessionToken)
 * @param {String} data.refreshToken - Refresh token
 * @param {String} data.userAgent - User agent string
 * @param {String} data.ipAddress - IP address
 * @param {Object} data.deviceInfo - Device info (browser, os, device)
 * @param {Object} data.location - Location info (country, city)
 */
sessionSchema.statics.createSession = async function(data) {
    try {
        // Validate required fields
        if (!data.userId) {
            throw new Error('userId is required');
        }
        if (!data.sessionToken) {
            throw new Error('sessionToken is required');
        }
        if (!data.refreshToken) {
            throw new Error('refreshToken is required');
        }

        // Hash refresh token
        const refreshTokenHash = this.hashRefreshToken(data.refreshToken);

        // Create session with provided JWT token as sessionToken
        const session = await this.create({
            userId: data.userId,
            sessionToken: data.sessionToken,  // Use JWT token as sessionToken
            refreshToken: data.refreshToken,
            refreshTokenHash: refreshTokenHash,
            userAgent: data.userAgent || '',
            ipAddress: data.ipAddress || 'unknown',
            deviceInfo: data.deviceInfo || { browser: 'Unknown', os: 'Unknown', device: 'Unknown' },
            location: data.location || {}
        });

        return {
            sessionId: session._id.toString(),
            sessionToken: session.sessionToken  // Return JWT token
        };
    } catch (error) {
        console.error('Create session error:', error);
        throw error;
    }
};

/**
 * Validate session by sessionToken
 * @param {String} sessionToken - JWT access token
 */
sessionSchema.statics.validateSession = async function(sessionToken) {
    try {
        if (!sessionToken) {
            return null;
        }

        const session = await this.findOne({ 
            sessionToken, 
            isActive: true 
        });

        if (!session) {
            return null;
        }

        // Check if expired
        if (session.isExpired()) {
            await session.revoke('expired');
            return null;
        }

        // Update last active
        await session.updateLastActive();

        return session;
    } catch (error) {
        console.error('Validate session error:', error);
        return null;
    }
};

/**
 * Find all active sessions for user
 */
sessionSchema.statics.findActiveSessions = async function(userId) {
    try {
        return await this.find({
            userId,
            isActive: true
        })
        .select('-refreshToken -refreshTokenHash')
        .sort('-lastActiveAt')
        .lean();
    } catch (error) {
        console.error('Find active sessions error:', error);
        throw error;
    }
};

/**
 * Revoke all sessions for user
 * @param {String} userId - User ID
 * @param {String} reason - Revoke reason
 * @param {String} excludeSessionId - Session ID to exclude (optional)
 */
sessionSchema.statics.revokeAllSessions = async function(userId, reason, excludeSessionId = null) {
    try {
        const query = { userId, isActive: true };
        
        if (excludeSessionId) {
            query._id = { $ne: excludeSessionId };
        }

        const result = await this.updateMany(
            query,
            {
                $set: {
                    isActive: false,
                    revokedAt: new Date(),
                    revokeReason: reason
                }
            }
        );

        return result;
    } catch (error) {
        console.error('Revoke all sessions error:', error);
        throw error;
    }
};

/**
 * Get session count for user
 */
sessionSchema.statics.getSessionCount = async function(userId) {
    try {
        return await this.countDocuments({ 
            userId, 
            isActive: true 
        });
    } catch (error) {
        console.error('Get session count error:', error);
        throw error;
    }
};

/**
 * Cleanup expired or inactive sessions (for cron job)
 */
sessionSchema.statics.cleanupSessions = async function() {
    try {
        // Delete sessions that are inactive and older than 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await this.deleteMany({
            $or: [
                { 
                    isActive: false, 
                    revokedAt: { $lt: thirtyDaysAgo } 
                },
                { 
                    createdAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } 
                }
            ]
        });

        console.log(`Cleaned up ${result.deletedCount} expired sessions`);
        return result.deletedCount;
    } catch (error) {
        console.error('Cleanup sessions error:', error);
        throw error;
    }
};

/**
 * Validate and rotate refresh token
 * @param {String} sessionToken - JWT access token
 * @param {String} refreshToken - Refresh token to validate
 */
sessionSchema.statics.validateAndRotateRefreshToken = async function(sessionToken, refreshToken) {
    try {
        const session = await this.findOne({ sessionToken })
            .select('+refreshTokenHash +refreshTokenFamily');

        if (!session || !session.isActive) {
            return { 
                valid: false, 
                error: 'Invalid session' 
            };
        }

        // Hash the provided token and compare
        const providedHash = this.hashRefreshToken(refreshToken);

        if (providedHash !== session.refreshTokenHash) {
            // Token mismatch - possible token theft attempt
            console.warn('Refresh token mismatch - possible theft attempt', {
                sessionId: session._id,
                userId: session.userId
            });

            // Revoke this session and all sessions in the family
            await session.revoke('token_compromised');
            await this.revokeAllSessions(session.userId, 'token_compromised');

            return {
                valid: false,
                error: 'Session compromised - all sessions revoked',
                compromised: true
            };
        }

        // Token is valid - update last active
        await session.updateLastActive();

        return {
            valid: true,
            session,
            refreshTokenFamily: session.refreshTokenFamily
        };
    } catch (error) {
        console.error('Validate refresh token error:', error);
        return { 
            valid: false, 
            error: error.message 
        };
    }
};

/**
 * Update refresh token in session (for rotation)
 * @param {String} sessionToken - JWT access token
 * @param {String} newRefreshToken - New refresh token
 */
sessionSchema.statics.updateRefreshToken = async function(sessionToken, newRefreshToken) {
    try {
        const session = await this.findOne({ sessionToken });

        if (!session) {
            throw new Error('Session not found');
        }

        session.refreshToken = newRefreshToken;
        session.refreshTokenHash = this.hashRefreshToken(newRefreshToken);
        await session.save();

        return { success: true };
    } catch (error) {
        console.error('Update refresh token error:', error);
        throw error;
    }
};

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Pre-save middleware
 */
sessionSchema.pre('save', function(next) {
    // Ensure lastActiveAt is updated
    if (this.isNew) {
        this.lastActiveAt = new Date();
    }
    next();
});

/**
 * Post-save middleware (logging)
 */
sessionSchema.post('save', function(doc) {
    if (this.isNew) {
        console.log(`New session created: ${doc._id} for user: ${doc.userId}`);
    }
});

// ============================================
// EXPORT
// ============================================

module.exports = mongoose.model('Session', sessionSchema);