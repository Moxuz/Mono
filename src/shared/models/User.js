const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}._-]{2,63}$/u;

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        sparse: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [64, 'Username must be at most 64 characters'],
        match: [USERNAME_RE, 'Username contains unsupported characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        maxlength: [254, 'Email must be at most 254 characters'],
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,63}$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        select: false
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    
    githubId: { type: String, sparse: true, unique: true },
    avatar: { type: String, maxlength: 2048 },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    displayName: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
    },
    bio: {
        type: String,
        trim: true,
        maxlength: 160,
        default: ''
    },

    // Account Lockout
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date,
        default: null
    },

    passwordResetToken: {
        type: String,
        select: false
    },
    passwordResetExpires: {
        type: Date,
        select: false
    },

    
    preferences: {
        theme: {
            type: String,
            enum: ['dark', 'light', 'auto'],
            default: 'dark'
        },
        language: {
            type: String,
            enum: ['en', 'th'],
            default: 'en'
        },
        notifications: {
            email: {
                type: Boolean,
                default: true
            },
            loginAlerts: {
                type: Boolean,
                default: true
            }
        }
    },

    // PDPA Consent
    pdpaConsent: {
        essentialAccepted: {
            type: Boolean,
            default: false
        },
        essentialAcceptedAt: {
            type: Date
        },
        analyticsAccepted: {
            type: Boolean,
            default: false
        },
        analyticsAcceptedAt: {
            type: Date
        },
        cookieConsentAccepted: {
            type: Boolean,
            default: null
        },
        cookieConsentAt: {
            type: Date
        },
        policyVersion: {
            type: String,
            default: null
        },
        consentIp: {
            type: String
        },
        accountDeletedAt: {
            type: Date
        },
        accountDeleteReason: {
            type: String,
            maxlength: 120
        }
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) return next();
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

// Check if account is locked
userSchema.methods.isLocked = function() {
    if (!this.lockUntil) return false;
    return this.lockUntil > new Date();
};

// Increment failed login attempts
userSchema.methods.incrementLoginAttempts = async function() {
    const maxAttempts = 5;
    const lockTimeMs = 15 * 60 * 1000;
    const now = new Date();

    if (this.lockUntil && this.lockUntil > now) {
        return true;
    }

    // Reset an expired lock once, then increment with MongoDB's atomic $inc.
    // Document read/modify/save can lose concurrent failed attempts and let a
    // distributed brute-force burst bypass the five-attempt threshold.
    await this.constructor.updateOne(
        { _id: this._id, lockUntil: { $lte: now } },
        { $set: { failedLoginAttempts: 0, lockUntil: null } }
    );

    const updated = await this.constructor.findOneAndUpdate(
        {
            _id: this._id,
            $or: [{ lockUntil: null }, { lockUntil: { $exists: false } }]
        },
        { $inc: { failedLoginAttempts: 1 } },
        { new: true }
    );

    if (!updated) return true;

    this.failedLoginAttempts = updated.failedLoginAttempts;
    this.lockUntil = updated.lockUntil || null;
    if (updated.failedLoginAttempts < maxAttempts) return false;

    const lockUntil = new Date(Date.now() + lockTimeMs);
    await this.constructor.updateOne(
        { _id: this._id, failedLoginAttempts: { $gte: maxAttempts } },
        { $set: { lockUntil } }
    );
    this.lockUntil = lockUntil;
    return true;
};

// Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = async function() {
    await this.constructor.updateOne(
        { _id: this._id },
        { $set: { failedLoginAttempts: 0, lockUntil: null } }
    );
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
};

module.exports = mongoose.model('User', userSchema);
