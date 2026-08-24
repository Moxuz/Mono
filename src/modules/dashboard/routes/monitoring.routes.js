const express = require('express');
const router = express.Router();
const { getSystemHealth } = require('../controllers/monitoring.controller');
const { authenticate } = require('../../auth/middleware/authenticate');
const { authorizeRole } = require('../../auth/middleware/authorization');

// The private admin UI needs one dependency-readiness endpoint only.
router.get('/health', authenticate, authorizeRole('admin'), getSystemHealth);

module.exports = router;
