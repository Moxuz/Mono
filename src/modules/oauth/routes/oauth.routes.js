const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauth.controller');
const { authenticate } = require('../../auth/middleware/authenticate');
const { validate, rules } = require('../../../shared/middleware/validate');
const {
    tokenLimiter,
    authorizeLimiter,
    introspectLimiter,
    revokeLimiter,
    generalLimiter,
    userinfoLimiter,
} = require('../../../shared/middleware/rateLimiter');

// OAuth 2.0 Flow (Public endpoints)
router.get('/authorize',   authorizeLimiter,  oauthController.showAuthorizeForm);
router.post('/authorize',  authorizeLimiter,  oauthController.authorize);
router.post('/token',      tokenLimiter,       oauthController.token);
router.get('/userinfo',    userinfoLimiter,       oauthController.userinfo);
router.post('/introspect', introspectLimiter,  oauthController.introspectToken);

// Client Management (Protected endpoints)
router.post('/clients',       authenticate, validate(rules.registerClient), oauthController.registerClient);
router.get('/clients',        authenticate, oauthController.listClients);
router.get('/clients/:id',    authenticate, oauthController.getClient);
router.put('/clients/:id',    authenticate, oauthController.updateClient);
router.delete('/clients/:id', authenticate, oauthController.deleteClient);

// Token Management (Protected)
router.post('/revoke', authenticate, revokeLimiter, oauthController.revokeToken);

// Consent Management (Protected) — PDPA right to object
router.delete('/consents/:clientId', authenticate, generalLimiter, oauthController.revokeConsent);

module.exports = router;