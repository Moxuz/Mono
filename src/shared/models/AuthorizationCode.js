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
    // Bind the one-time code to the exact consent grant that approved it.
    grantId: {
        type: String,
        required: true,
        index: true
    },
    redirectUri: {
        type: String,
        required: true
    },
    scope: {
        type: String,
        default: 'openid profile email'
    },
    // usedAt: null = unused; usedAt set = already consumed
    usedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }
    },

    // PKCE fields for OAuth 2.0 code challenge
    code_challenge: {
        type: String,
        default: null
    },
    code_challenge_method: {
        type: String,
        enum: ['S256'],
        default: 'S256'
    },
    // OIDC nonce is echoed into the ID token to prevent replay/mix-up attacks.
    nonce: {
        type: String,
        maxlength: 255,
        default: null
    }

}, {
    timestamps: true
});

// Virtual: used — derived from usedAt so no separate boolean needed
authorizationCodeSchema.virtual('used').get(function() {
    return this.usedAt !== null;
});

// Mark code as used
authorizationCodeSchema.methods.markAsUsed = async function() {
    this.usedAt = new Date();
    await this.save();
};

// Check if code is valid
authorizationCodeSchema.statics.isValid = async function(code) {
    const entry = await this.findOne({
        code,
        usedAt: null,
        expiresAt: { $gt: new Date() }
    });
    return !!entry;
};

module.exports = mongoose.model('AuthorizationCode', authorizationCodeSchema);