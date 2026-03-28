const mongoose = require('mongoose');

const authorizationCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    clientId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    redirectUri: {
        type: String,
        required: true
    },
    scope: {
        type: String,
        default: 'openid profile email'
    },
    used: {
        type: Boolean,
        default: false
    },
    usedAt: {
        type: Date
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }
    },

    // PKCE fields สำหรับ OAuth 2.0 code challenge
    code_challenge: {
        type: String,
        default: null
    },
    code_challenge_method: {
        type: String,
        enum: ['S256'],
        default: 'S256'
    }

}, {
    timestamps: true
});

// Mark code as used
authorizationCodeSchema.methods.markAsUsed = async function() {
    this.used = true;
    this.usedAt = new Date();
    await this.save();
};

// Check if code is valid
authorizationCodeSchema.statics.isValid = async function(code) {
    const entry = await this.findOne({ 
        code, 
        used: false,
        expiresAt: { $gt: new Date() }
    });
    return !!entry;
};

module.exports = mongoose.model('AuthorizationCode', authorizationCodeSchema);