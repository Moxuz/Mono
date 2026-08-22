const express = require('express');
const router  = express.Router();
const config  = require('../../../shared/config/config');
const oidcKeys = require('../../../shared/config/oidcKeys');

// ─── /.well-known/openid-configuration ───────────────────────────
router.get('/openid-configuration', (req, res) => {
    const baseUrl = config.BASE_URL || 'http://localhost:5000';

    res.json({
        issuer:                                baseUrl,
        authorization_endpoint:               `${baseUrl}/api/oauth/authorize`,
        token_endpoint:                        `${baseUrl}/api/oauth/token`,
        userinfo_endpoint:                     `${baseUrl}/api/oauth/userinfo`,
        revocation_endpoint:                   `${baseUrl}/api/oauth/revoke`,
        introspection_endpoint:                `${baseUrl}/api/oauth/introspect`,

        jwks_uri:                              `${baseUrl}/.well-known/jwks.json`,

        scopes_supported:                      ['openid', 'profile', 'email', 'offline_access'],
        response_types_supported:              ['code'],
        grant_types_supported:                 ['authorization_code', 'refresh_token'],
        subject_types_supported:               ['public'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
        access_token_signing_alg_values_supported: ['RS256'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported:      ['S256'],
        nonce_supported:                       true,

        claims_supported: [
            'sub', 'iss', 'aud', 'exp', 'iat',
            'email',
            'name', 'username'
        ],
    });
});

// ─── /.well-known/jwks.json ───────────────────────────────────────
router.get('/jwks.json', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(oidcKeys.jwks);
});

module.exports = router;
