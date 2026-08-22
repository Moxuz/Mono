const mongoose = require('mongoose');
const crypto = require('crypto');

const consentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    clientId: {
        type: String,
        required: true,
        index: true
    },
    // New or changed approvals receive a new grant identifier. Repeating an active
    // approval for the same scopes keeps the grant so existing tokens remain valid;
    // explicit revocation still changes the grant on the next approval.
    grantId: {
        type: String,
        required: true,
        index: true,
        default: () => crypto.randomBytes(24).toString('hex')
    },
    scope: {
        type: String,
        required: true
    },
    grantedAt: {
        type: Date,
        default: Date.now
    },
    revokedAt: {
        type: Date,
        default: null,
        index: true
    },
    revokeReason: {
        type: String,
        default: null
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        index: { expires: 0 }
    }
}, {
    timestamps: true
});

// One active grant record per user/client. Revocation keeps the record for
// audit/history and a later approval receives a new grantId.
consentSchema.index({ userId: 1, clientId: 1 }, { unique: true });

// Read the currently active grant and ensure it covers requested scopes.
consentSchema.statics.getActiveGrant = async function(userId, clientId, scope = '') {
    const consent = await this.findOne({
        userId,
        clientId,
        revokedAt: null,
        expiresAt: { $gt: new Date() }
    });

    if (!consent) return null;

    // Upgrade records created before grant binding without document validation.
    if (!consent.grantId) {
        const grantId = crypto.randomBytes(24).toString('hex');
        await this.updateOne({ _id: consent._id }, { $set: { grantId } });
        consent.grantId = grantId;
    }

    const requestedScopes = String(scope || '').split(/\s+/).filter(Boolean);
    if (requestedScopes.length > 0) {
        const approvedScopes = new Set(String(consent.scope || '').split(/\s+/).filter(Boolean));
        if (!requestedScopes.every((requested) => approvedScopes.has(requested))) {
            return null;
        }
    }

    return consent;
};

consentSchema.statics.hasConsented = async function(userId, clientId, scope) {
    return Boolean(await this.getActiveGrant(userId, clientId, scope));
};

// Standard identity consent is remembered for 30 days. Extended/resource
// scopes are remembered for 7 days in this private deployment.
consentSchema.statics.saveConsent = async function(userId, clientId, scope) {
    const OIDC_BASE = new Set(['openid', 'profile', 'email', 'offline_access']);
    const normalizedScope = String(scope || '').split(/\s+/).filter(Boolean).join(' ');
    const hasExtendedScopes = normalizedScope.split(' ').some((s) => s && !OIDC_BASE.has(s));
    const ttlDays = hasExtendedScopes ? 7 : 30;
    const now = new Date();

    const current = await this.findOne({ userId, clientId })
        .select('grantId scope revokedAt expiresAt');
    const currentScopes = new Set(String(current?.scope || '').split(/\s+/).filter(Boolean));
    const requestedScopes = new Set(normalizedScope.split(' ').filter(Boolean));
    const sameScope = Boolean(current) && currentScopes.size === requestedScopes.size &&
        [...requestedScopes].every((requested) => currentScopes.has(requested));
    const keepGrant = Boolean(current?.grantId && !current.revokedAt &&
        current.expiresAt && current.expiresAt > now && sameScope);
    const grantId = keepGrant ? current.grantId : crypto.randomBytes(24).toString('hex');

    return this.findOneAndUpdate(
        { userId, clientId },
        {
            $set: {
                userId,
                clientId,
                scope: normalizedScope,
                grantId,
                grantedAt: new Date(),
                revokedAt: null,
                revokeReason: null,
                expiresAt: new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

// Keep a tombstone so existing grants cannot silently become valid again.
consentSchema.statics.revokeConsent = async function(userId, clientId, reason = 'user_request') {
    return this.updateOne(
        { userId, clientId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokeReason: reason } }
    );
};

consentSchema.statics.revokeAllForUser = async function(userId, reason = 'user_deactivated') {
    return this.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokeReason: reason } }
    );
};

consentSchema.statics.revokeAllForClient = async function(clientId, reason = 'client_deactivated') {
    return this.updateMany(
        { clientId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokeReason: reason } }
    );
};

module.exports = mongoose.model('Consent', consentSchema);
