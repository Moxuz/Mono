'use strict';

const crypto = require('crypto');
const config = require('./config');

let privateKey;
let publicKey;

if (config.OIDC_PRIVATE_KEY) {
    privateKey = crypto.createPrivateKey(config.OIDC_PRIVATE_KEY);
    publicKey = config.OIDC_PUBLIC_KEY
        ? crypto.createPublicKey(config.OIDC_PUBLIC_KEY)
        : crypto.createPublicKey(privateKey);
} else {
    // Development-only fallback. Production rejects missing persistent keys
    // in config.js so an application restart cannot invalidate verification.
    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
}

const publicJwk = publicKey.export({ format: 'jwk' });

module.exports = {
    privateKey,
    publicKey,
    keyId: config.OIDC_KEY_ID,
    jwks: {
        keys: [{
            ...publicJwk,
            alg: 'RS256',
            use: 'sig',
            kid: config.OIDC_KEY_ID
        }]
    }
};
