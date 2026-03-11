  const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauth.controller');
const { authenticate } = require('../../auth/middleware/authenticate');

// OAuth 2.0 Flow (Public endpoints)
router.get('/authorize', oauthController.showAuthorizeForm);
router.post('/authorize', oauthController.authorize);
router.post('/token', oauthController.token);
router.get('/userinfo', oauthController.userinfo);
router.post('/introspect', oauthController.introspectToken);

// Client Management (Protected endpoints)
router.post('/clients', authenticate, oauthController.registerClient);
router.get('/clients', authenticate, oauthController.listClients);
router.get('/clients/:id', authenticate, oauthController.getClient);
router.put('/clients/:id', authenticate, oauthController.updateClient);
router.delete('/clients/:id', authenticate, oauthController.deleteClient);

// Token Management (Protected)
router.post('/revoke', authenticate, oauthController.revokeToken);

module.exports = router;
