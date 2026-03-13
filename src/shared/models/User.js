const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        select: false
    },
    googleId: {
        type: String,
        sparse: true
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'moderator'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    
      passwordResetToken: {
        type: String,
        select: false    // ไม่ดึงมาโดย default (ปลอดภัย)
    },
    passwordResetExpires: {
        type: Date,
        select: false
    },

    // ✅ PDPA Consent
pdpaConsent: {
    // ── Essential (Required) ──────────────────────
    essentialAccepted: {
        type: Boolean,
        default: false
    },
    essentialAcceptedAt: {
        type: Date
    },

    // ── Analytics (Optional) ─────────────────────
    analyticsAccepted: {
        type: Boolean,
        default: false
    },
    analyticsAcceptedAt: {
        type: Date
    },

    // ── Cookie Banner ─────────────────────────────
    cookieConsentAccepted: {
        type: Boolean,
        default: null
    },
    cookieConsentAt: {
        type: Date
    },

    // ── Audit ─────────────────────────────────────
    policyVersion: {
        type: String,
        default: null
    },
    consentIp: {
        type: String
    }
}
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);