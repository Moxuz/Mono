// src/modules/auth/routes/social.routes.js

const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../../shared/config/config');
const logger = require('../../../shared/utils/logger');
const SecurityAudit = require('../../../shared/models/SecurityAudit');
const Client = require('../../../shared/models/Client');
const Consent = require('../../../shared/models/Consent');
const oauthService = require('../../oauth/services/oauth.service');
const { sendLoginAlertIfEnabled } = require('../services/auth.service');
const { sanitizeRequestedScopes } = require('../../../shared/utils/oauthScopes');
const { establishWebSession } = require('../../../shared/services/webSession.service');

function isSafeRelativePath(value) {
  return typeof value === 'string' && value.length <= 2048 &&
    /^\/(?![\/\\])/.test(value) && !/[\r\n]/.test(value);
}

function socialState() {
  return crypto.randomBytes(24).toString('hex');
}

function validateSocialState(req, res, next) {
  const expected = req.session.socialOAuthState;
  const received = req.query.state;
  delete req.session.socialOAuthState;
  if (!expected || !received || expected !== received) {
    return res.redirect('/login.html?error=invalid_oauth_state');
  }
  return next();
}

// สร้าง token อายุสั้นสำหรับยืนยันตัวตนก่อนลบบัญชี
function generateReauthToken(userId) {
  return jwt.sign(
    { userId: userId.toString(), purpose: 'delete_account', jti: crypto.randomBytes(16).toString('hex') },
    config.JWT_SECRET,
    { expiresIn: '5m' }
  );
}

// Validate the standard OAuth client flow before handing control to the
// external provider. The callback will issue a one-time authorization code,
// never an access/refresh token in a redirect URL.
async function prepareOAuthClientFlow(req, res) {
  const hasOAuthParams = req.query.client_id || req.query.redirect_uri;
  if (!hasOAuthParams) return true;

  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: responseType,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    nonce
  } = req.query;

  if (responseType !== 'code' || !clientId || !redirectUri ||
      typeof state !== 'string' || !state || state.length > 2048 ||
      !/^[A-Za-z0-9._~-]+$/.test(state) ||
      !codeChallenge || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) ||
      codeChallengeMethod !== 'S256' ||
      typeof nonce !== 'string' || !nonce || nonce.length > 255 ||
      !/^[A-Za-z0-9._~-]+$/.test(nonce)) {
    res.status(400).json({ error: 'invalid_request', error_description: 'OAuth client flow requires code, state, nonce and S256 PKCE' });
    return false;
  }

  const client = await Client.findOne({
    client_id: clientId,
    redirect_uris: redirectUri,
    isActive: true
  });
  if (!client || client.application_type !== 'web' ||
      !client.grant_types?.includes('authorization_code') ||
      !client.response_types?.includes('code')) {
    res.status(400).json({ error: 'invalid_client', error_description: 'Invalid client or redirect URI' });
    return false;
  }

  const validScopes = sanitizeRequestedScopes(req.query.scope, client.scope);
  if (!validScopes.length) {
    res.status(400).json({ error: 'invalid_scope', error_description: 'Requested scopes are not permitted for this client' });
    return false;
  }

  req.session.oauthClientFlow = {
    clientId,
    clientName: client.client_name,
    redirectUri,
    state,
    codeChallenge,
    codeChallengeMethod,
    nonce,
    scope: validScopes.join(' '),
    remember: req.session.socialRemember === true
  };
  return true;
}

async function finishOAuthClientFlow(req, res) {
  const flow = req.session.oauthClientFlow;
  if (!flow) return false;

  const scope = flow.scope || 'openid profile email';
  const consent = await Consent.getActiveGrant(req.user._id, flow.clientId, scope);
  if (!consent) {
    // Keep the flow in the session while the user makes an explicit decision
    // on the AuthSys consent page. The normal authorize POST will issue the
    // code and record consent after the user clicks Allow.
    await establishWebSession(req, req.user, null, ['oauthClientFlow'], {
      remember: flow.remember === true
    });
    const params = new URLSearchParams({
      mode: 'consent',
      client_id: flow.clientId,
      client_name: flow.clientName || flow.clientId,
      redirect_uri: flow.redirectUri,
      response_type: 'code',
      scope,
      state: flow.state,
      code_challenge: flow.codeChallenge,
      code_challenge_method: flow.codeChallengeMethod,
      nonce: flow.nonce
    });
    return res.redirect(`/consent.html?${params.toString()}`);
  }

  delete req.session.oauthClientFlow;
  const code = await oauthService.generateAuthorizationCode(
    req.user._id,
    flow.clientId,
    flow.redirectUri,
    scope,
    { code_challenge: flow.codeChallenge, code_challenge_method: flow.codeChallengeMethod },
    flow.nonce,
    consent.grantId
  );
  await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));

  const separator = flow.redirectUri.includes('?') ? '&' : '?';
  return res.redirect(`${flow.redirectUri}${separator}code=${encodeURIComponent(code)}&state=${encodeURIComponent(flow.state)}`);
}

async function finishInternalSessionFlow(req, res) {
  const returnTo = req.session.oauthSessionReturnTo;
  if (!isSafeRelativePath(returnTo)) return false;

  delete req.session.oauthSessionReturnTo;
  const remember = req.session.socialRemember === true;
  delete req.session.socialRemember;
  await establishWebSession(req, req.user, null, [], { remember });
  return res.redirect(returnTo);
}

// นำเข้าสถานะ OAuth providers ที่เปิดใช้งาน
const {
  GOOGLE_ENABLED,
  GITHUB_ENABLED
} = require('../../../shared/config/passport');

/**
 * @swagger
 * tags:
 *   name: Social Login
 *   description: OAuth authentication (Google, GitHub)
 */

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE OAUTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google login
 *     tags: [Social Login]
 */
if (GOOGLE_ENABLED) {
  // เริ่มกระบวนการ login ผ่าน Google OAuth
  router.get('/google', async (req, res, next) => {
    try {
      req.session.socialRemember = req.query.remember === '1';
      if (!await prepareOAuthClientFlow(req, res)) return;
    } catch (error) {
      return next(error);
    }
  if (req.query.action === 'delete_account') {
      req.session.oauthAction = 'delete_account';
      req.session.oauthReturnTo = isSafeRelativePath(req.query.returnTo) ? req.query.returnTo : '/profile.html';
    } else if (isSafeRelativePath(req.query.returnTo)) {
      // OAuth client flow: preserve returnTo to complete the authorization code grant
      req.session.oauthSessionReturnTo = req.query.returnTo;
    }
    req.session.socialOAuthState = socialState();
    passport.authenticate('google', {
      scope: ['openid', 'profile', 'email'],
      prompt: 'select_account',
      state: req.session.socialOAuthState
    })(req, res, next);
  });

  /**
   * @swagger
   * /api/auth/google/callback:
   *   get:
   *     summary: Google OAuth callback
   *     tags: [Social Login]
   */
  // รับ callback จาก Google หลัง login สำเร็จ สร้าง JWT และ session
  router.get('/google/callback',
    validateSocialState,
    passport.authenticate('google', {
      session: false,
      failureRedirect: '/login.html?error=google_failed'
    }),
    async (req, res) => {
      try {
        // จัดการ re-authentication สำหรับการลบบัญชี
        if (req.session.oauthAction === 'delete_account') {
          const returnTo = req.session.oauthReturnTo || '/profile.html';
          delete req.session.oauthAction;
          delete req.session.oauthReturnTo;
          logger.info(`Google re-auth for account deletion: ${req.user.email}`);
          const reauthToken = generateReauthToken(req.user._id);
          res.cookie('reauth_token', reauthToken, {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 5 * 60 * 1000
          });
          const separator = returnTo.includes('?') ? '&' : '?';
          return res.redirect(`${returnTo}${separator}action=delete_account&verified=1`);
        }

        logger.info(`Google login successful: ${req.user.email}`);

        // บันทึก security event
        await SecurityAudit.create({
          action: 'login_success',
          userId: req.user._id,
          status: 'success',
          ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
          userAgent: req.headers['user-agent'],
          metadata: {
            method: 'google',
            email: req.user.email,
            provider: 'google'
          }
        });

        if (await finishOAuthClientFlow(req, res)) return;
        if (await finishInternalSessionFlow(req, res)) return;

        // ส่ง login alert email (ไม่รอผล)
        sendLoginAlertIfEnabled(req.user, req).catch(err => {
          logger.error('Google OAuth: login alert email failed:', err.message);
        });
        const remember = req.session.socialRemember === true;
        delete req.session.socialRemember;
        await establishWebSession(req, req.user, null, [], { remember });
        res.redirect('/dashboard.html');

      } catch (error) {
        logger.error('Google callback error:', error);
        res.redirect('/login.html?error=google_callback_error');
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GITHUB OAUTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/github:
 *   get:
 *     summary: Initiate GitHub login
 *     tags: [Social Login]
 */
if (GITHUB_ENABLED) {
  // เริ่มกระบวนการ login ผ่าน GitHub OAuth
  router.get('/github', async (req, res, next) => {
    try {
      req.session.socialRemember = req.query.remember === '1';
      if (!await prepareOAuthClientFlow(req, res)) return;
    } catch (error) {
      return next(error);
    }
  if (req.query.action === 'delete_account') {
      req.session.oauthAction = 'delete_account';
      req.session.oauthReturnTo = isSafeRelativePath(req.query.returnTo) ? req.query.returnTo : '/profile.html';
    } else if (isSafeRelativePath(req.query.returnTo)) {
      // OAuth client flow: preserve returnTo to complete the authorization code grant
      req.session.oauthSessionReturnTo = req.query.returnTo;
    }
    req.session.socialOAuthState = socialState();
    passport.authenticate('github', {
      scope: ['user:email'],
      state: req.session.socialOAuthState
    })(req, res, next);
  });

  /**
   * @swagger
   * /api/auth/github/callback:
   *   get:
   *     summary: GitHub OAuth callback
   *     tags: [Social Login]
   */
  // รับ callback จาก GitHub หลัง login สำเร็จ สร้าง JWT และ session
  router.get('/github/callback',
    validateSocialState,
    passport.authenticate('github', {
      session: false,
      failureRedirect: '/login.html?error=github_failed'
    }),
    async (req, res) => {
      try {
        // จัดการ re-authentication สำหรับการลบบัญชี
        if (req.session.oauthAction === 'delete_account') {
          const returnTo = req.session.oauthReturnTo || '/profile.html';
          delete req.session.oauthAction;
          delete req.session.oauthReturnTo;
          logger.info(`GitHub re-auth for account deletion: ${req.user.email || req.user.username}`);
          const reauthToken = generateReauthToken(req.user._id);
          res.cookie('reauth_token', reauthToken, {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 5 * 60 * 1000
          });
          const separator = returnTo.includes('?') ? '&' : '?';
          return res.redirect(`${returnTo}${separator}action=delete_account&verified=1`);
        }

        logger.info(`GitHub login successful: ${req.user.email || req.user.username}`);

        // บันทึก security event
        await SecurityAudit.create({
          action: 'login_success',
          userId: req.user._id,
          status: 'success',
          ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
          userAgent: req.headers['user-agent'],
          metadata: {
            method: 'github',
            email: req.user.email,
            username: req.user.username,
            provider: 'github'
          }
        });

        if (await finishOAuthClientFlow(req, res)) return;
        if (await finishInternalSessionFlow(req, res)) return;

        // ส่ง login alert email (ไม่รอผล)
        sendLoginAlertIfEnabled(req.user, req).catch(err => {
          logger.error('GitHub OAuth: login alert email failed:', err.message);
        });
        const remember = req.session.socialRemember === true;
        delete req.session.socialRemember;
        await establishWebSession(req, req.user, null, [], { remember });
        res.redirect('/dashboard.html');

      } catch (error) {
        logger.error('GitHub callback error:', error);
        res.redirect('/login.html?error=github_callback_error');
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS ENDPOINT - Check which OAuth providers are enabled
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/oauth/status:
 *   get:
 *     summary: Get OAuth providers status
 *     tags: [Social Login]
 */
// ตรวจสอบสถานะว่า OAuth provider ใดบ้างที่เปิดใช้งานอยู่
router.get('/oauth/status', (req, res) => {
  res.json({
    success: true,
    data: {
      google: GOOGLE_ENABLED,
      github: GITHUB_ENABLED
    }
  });
});

module.exports = router;
