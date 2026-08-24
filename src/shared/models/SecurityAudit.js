const mongoose = require('mongoose');
const config = require('../config/config');
const {
    hashIdentity,
    sanitizeAuditMetadata
} = require('../utils/auditIdentity');

const securityAuditSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Deprecated legacy field. New records store only emailHash. Keeping the
    // field for migration compatibility lets the cleanup job scrub old rows
    // without breaking existing collections.
    email: {
        type: String,
        default: null,
        select: false
    },
    // Deterministic HMAC used to correlate pre-auth events without storing PII.
    emailHash: {
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
            'consent_denied',
            'consent_revoked',
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
        default: () => new Date(Date.now() + config.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        index: { expires: 0 }
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
securityAuditSchema.index({ ipAddress: 1, createdAt: -1 }); // "login จาก IP ไหน"
securityAuditSchema.index({ emailHash: 1, createdAt: -1 }); // pre-auth event lookup by pseudonymous identity
securityAuditSchema.index({ userId: 1, action: 1, createdAt: -1 }); // per-user action history
securityAuditSchema.index({ action: 1, createdAt: -1 });

// Direct SecurityAudit.create() call sites also pass through this hook. It is
// the safety net for older routes that have not yet been migrated to the
// security-audit service.
securityAuditSchema.pre('validate', function(next) {
    const metadata = this.metadata || {};
    const candidateEmail = this.email || metadata.email;
    const emailHash = this.emailHash || hashIdentity(candidateEmail);

    if (emailHash) this.emailHash = emailHash;
    this.email = null;
    this.metadata = sanitizeAuditMetadata(metadata);
    next();
});

// Static method to log security event
securityAuditSchema.statics.logEvent = async function(data) {
    const metadata = data.metadata || {};
    const candidateEmail = data.email || metadata.email;

    return await this.create({
        userId: data.userId || null,
        email: null,
        emailHash: data.emailHash || hashIdentity(candidateEmail),
        action: data.action,
        status: data.status || 'success',
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: sanitizeAuditMetadata(metadata)
    });
};

function buildScrubUpdate(document, fallbackEmail = null) {
    const rawEmail = document.email || document.metadata?.email || fallbackEmail;
    const update = {
        $set: {
            metadata: sanitizeAuditMetadata(document.metadata || {})
        },
        $unset: {
            email: ''
        }
    };

    const emailHash = document.emailHash || hashIdentity(rawEmail);
    if (emailHash) update.$set.emailHash = emailHash;
    return update;
}

// Scrub historical rows created before audit redaction was centralized.
// This is intentionally idempotent so it can run from the nightly cleanup.
securityAuditSchema.statics.scrubLegacyIdentityFields = async function() {
    const legacyRows = await this.find({
        $or: [
            { email: { $type: 'string' } },
            { 'metadata.email': { $exists: true } },
            { 'metadata.emailAddress': { $exists: true } },
            { 'metadata.contact_email': { $exists: true } },
            { 'metadata.username': { $exists: true } },
            { 'metadata.displayName': { $exists: true } }
        ]
    }).select('+email').lean();

    if (!legacyRows.length) return 0;

    const operations = legacyRows.map(document => ({
        updateOne: {
            filter: { _id: document._id },
            update: buildScrubUpdate(document)
        }
    }));

    const result = await this.bulkWrite(operations, { ordered: false });
    return result.modifiedCount || 0;
};

// Immediately scrub all historical audit rows associated with a deleted user.
// This prevents the account-deletion flow from leaving the user's old email
// in the audit collection while the normal retention window is still active.
securityAuditSchema.statics.redactUserIdentity = async function(userId, email = null) {
    const identityFilter = [];
    if (userId) identityFilter.push({ userId });
    if (email) {
        identityFilter.push({ email });
        identityFilter.push({ 'metadata.email': email });
    }
    if (!identityFilter.length) return 0;

    const rows = await this.find({ $or: identityFilter })
        .select('+email')
        .lean();

    if (!rows.length) return 0;

    const operations = rows.map(document => ({
        updateOne: {
            filter: { _id: document._id },
            update: buildScrubUpdate(document, email)
        }
    }));

    const result = await this.bulkWrite(operations, { ordered: false });
    return result.modifiedCount || 0;
};

// Static method to get audit logs for a user
securityAuditSchema.statics.getUserLogs = async function(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    const logs = await this.find({ userId })
        .sort('-createdAt')
        .skip(skip)
        .limit(limit);
    
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
