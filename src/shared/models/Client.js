  const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const clientSchema = new mongoose.Schema({
    client_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    client_secret: {
        type: String,
        required: true,
        select: false // Don't include in queries by default
    },
    client_name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    logo_uri: {
        type: String
    },
    redirect_uris: [{
        type: String,
        required: true
    }],
    grant_types: [{
        type: String,
        enum: ['authorization_code', 'refresh_token', 'client_credentials'],
        default: ['authorization_code']
    }],
    response_types: [{
        type: String,
        enum: ['code', 'token', 'id_token'],
        default: ['code']
    }],
    scope: {
        type: String,
        default: 'openid profile email'
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    application_type: {
        type: String,
        enum: ['web', 'native', 'spa'],
        default: 'web'
    },
    contact_email: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Statistics
    totalUsers: {
        type: Number,
        default: 0
    },
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
        redirect_uris: redirect_uri,
        isActive: true
    });
};

module.exports = mongoose.model('Client', clientSchema);
