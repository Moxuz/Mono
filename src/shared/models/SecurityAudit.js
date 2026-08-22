const mongoose = require('mongoose');

const securityAuditSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // email stored separately — userId may be null for pre-auth events (e.g. login_failed)
    email: {
        type: String,
        default: null
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
            'account_locked',
            'token_refreshed',
            'token_revoked',
            'token_refresh_failed',
            'token_issued',
            'token_exchange_failed',
            'pkce_verification_failed',
            'client_auth_failed',
            'rate_limit_exceeded',
            'client_validation_failed',
            'userinfo_failed',
            'consent_granted',
            'registration_failed',
            'security_breach',
            'profile_updated',
            'account_created',
            'account_deactivated',
            'account_deleted',
        ]
    },
    status: {
        type: String,
        enum: ['success', 'failure'],
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

// Indexes for efficient queries
securityAuditSchema.index({ ipAddress: 1, createdAt: -1 }); // "login จาก IP ไหน"
securityAuditSchema.index({ email: 1, createdAt: -1 });     // pre-auth event lookup by email
securityAuditSchema.index({ userId: 1, action: 1, createdAt: -1 }); // per-user action history
securityAuditSchema.index({ action: 1, createdAt: -1 });

// Static method to log security event
securityAuditSchema.statics.logEvent = async function(data) {
    return await this.create({
        userId: data.userId || null,
        email: data.email || null,
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
