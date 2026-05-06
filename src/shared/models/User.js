const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        sparse: true,
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
        unique: true,
        sparse: true
    },
    
    githubId: { type: String, sparse: true, unique: true },     
     avatar: { type: String }, 
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

    // Account Lockout
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date,
        default: null
    },

    emailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        select: false
    },
    emailVerificationExpires: {
        type: Date,
        select: false
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

    if (this.lockUntil && this.lockUntil > new Date()) {
        return false;
    }

    if (this.lockUntil && this.lockUntil < new Date()) {
        this.failedLoginAttempts = 0;
        this.lockUntil = null;
    }

    this.failedLoginAttempts += 1;

    if (this.failedLoginAttempts >= maxAttempts) {
        this.lockUntil = new Date(Date.now() + lockTimeMs);
    }

    await this.save();
    return this.isLocked();
};

// Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = async function() {
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
    await this.save();
};

module.exports = mongoose.model('User', userSchema);