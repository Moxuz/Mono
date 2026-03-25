const mongoose = require('mongoose');

const securityAuditSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    action: {
        type: String,
        required: true,
        enum: [
            'login_success',
            'login_failed',
            'logout',
            'password_changed',
            'password_reset_requested',
            'password_reset_completed',
            'email_verified',
            'verification_email_sent',
            'account_locked',
            'account_unlocked',
            'token_refreshed',
            'token_revoked',
            'profile_updated',
            'account_created',
            'account_deactivated',
            'password_reset_completed',
        ],
        index: true
    },
    status: {
        type: String,
        enum: ['success', 'failure', 'pending'],
        default: 'success'
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        index: { expires: 0 }
    }
}, {
    timestamps: true
});

// Index for efficient queries
securityAuditSchema.index({ userId: 1, createdAt: -1 });
securityAuditSchema.index({ action: 1, createdAt: -1 });

// Static method to log security event
securityAuditSchema.statics.logEvent = async function(data) {
    return await this.create({
        userId: data.userId,
        action: data.action,
        status: data.status || 'success',
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: data.metadata || {}
    });
};

// Static method to get audit logs for a user
securityAuditSchema.statics.getUserLogs = async function(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    const logs = await this.find({ userId })
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('userId', 'email username');
    
    const total = await this.countDocuments({ userId });
    
    return {
        logs,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

// Static method to get recent failed logins
securityAuditSchema.statics.getRecentFailedLogins = async function(userId, minutes = 30) {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    
    return await this.find({
        userId,
        action: 'login_failed',
        createdAt: { $gte: cutoff }
    }).sort('-createdAt');
};

module.exports = mongoose.model('SecurityAudit', securityAuditSchema);
