  const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const clientSchema = new mongoose.Schema({
    client_id: {
        type: String,
        required: true,
        unique: true,
        index: true,
        maxlength: 128
    },
    client_secret: {
        type: String,
        required: true,
        select: false, // Don't include in queries by default
        maxlength: 256
    },
    client_name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    logo_uri: {
        type: String,
        maxlength: 2048
    },
    redirect_uris: [{
        type: String,
        required: true,
        maxlength: 2048
    }],
    // Private-project policy: confidential web clients using only the
    // authorization-code flow. Refresh is available only when the requested
    // scope contains offline_access.
    grant_types: {
        type: [String],
        enum: ['authorization_code', 'refresh_token'],
        default: ['authorization_code'],
        validate: {
            validator: value => Array.isArray(value) && value.length > 0,
            message: 'grant_types must contain at least one grant type'
        }
    },
    response_types: {
        type: [String],
        enum: ['code'],
        default: ['code'],
        validate: {
            validator: value => Array.isArray(value) && value.length > 0,
            message: 'response_types must contain at least one response type'
        }
    },
    scope: {
        type: String,
        default: 'openid profile email',
        maxlength: 500
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    application_type: {
        type: String,
        enum: ['web'],
        default: 'web'
    },
    contact_email: {
        type: String,
        required: true,
        maxlength: 254,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]{2,63}$/
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Statistics
    totalRequests: {
        type: Number,
        default: 0
    },
    lastUsed: {
        type: Date
    }
}, {
    timestamps: true
});

// Hash client_secret before saving
clientSchema.pre('save', async function(next) {
    if (!this.isModified('client_secret')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.client_secret = await bcrypt.hash(this.client_secret, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare client_secret
clientSchema.methods.compareSecret = async function(candidateSecret) {
    return await bcrypt.compare(candidateSecret, this.client_secret);
};

// Method to increment usage stats
clientSchema.methods.incrementUsage = async function() {
    this.totalRequests += 1;
    this.lastUsed = new Date();
    await this.save();
};

// Static method to find active client
clientSchema.statics.findActiveClient = async function(client_id, redirect_uri) {
    return await this.findOne({
        client_id,
        // OAuth redirect URI matching is an exact string comparison.
        redirect_uris: { $in: [redirect_uri] },
        isActive: true
    });
};

module.exports = mongoose.model('Client', clientSchema);
