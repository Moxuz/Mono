const mongoose = require('mongoose');

const consentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    clientId: {
        type: String,
        required: true
    },
    scope: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 วัน
        index: { expires: 0 }
    }
}, {
    timestamps: true
});

// ─── index ป้องกัน duplicate ──────────────────────────────────────
consentSchema.index({ userId: 1, clientId: 1 }, { unique: true });

// ─── เช็คว่าเคย consent แล้วยัง ──────────────────────────────────
consentSchema.statics.hasConsented = async function(userId, clientId, scope) {
    const consent = await this.findOne({
        userId,
        clientId,
        expiresAt: { $gt: new Date() }
    });

    if (!consent) return false;

    // เช็คว่า scope ที่ขอ ครอบคลุมอยู่ใน scope ที่เคย approve ไหม
    const approvedScopes = consent.scope.split(' ');
    const requestedScopes = scope.split(' ');
    return requestedScopes.every(s => approvedScopes.includes(s));
};

// ─── บันทึก consent ───────────────────────────────────────────────
consentSchema.statics.saveConsent = async function(userId, clientId, scope) {
    await this.findOneAndUpdate(
        { userId, clientId },
        {
            userId,
            clientId,
            scope,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        { upsert: true, new: true }
    );
};

// ─── ยกเลิก consent ───────────────────────────────────────────────
consentSchema.statics.revokeConsent = async function(userId, clientId) {
    await this.deleteOne({ userId, clientId });
};

module.exports = mongoose.model('Consent', consentSchema);