const express = require('express');
const router  = express.Router();
const config  = require('../../../shared/config/config');

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
        id_token_signing_alg_values_supported: ['HS256'],
        code_challenge_methods_supported:      ['S256'],

        claims_supported: [
            'sub', 'iss', 'aud', 'exp', 'iat',
            'email', 'email_verified',
            'name', 'username', 'role'
        ],
    });
});

// ─── /.well-known/jwks.json ───────────────────────────────────────
// ตอนนี้ใช้ HS256 จึง return empty keys
// เมื่อ upgrade เป็น RS256 ค่อยเพิ่ม public key ที่นี่
router.get('/jwks.json', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ keys: [] });
});

module.exports = router;
