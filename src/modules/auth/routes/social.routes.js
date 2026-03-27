// src/modules/auth/routes/social.routes.js

const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../../shared/config/config');
const logger = require('../../../shared/utils/logger');
const SecurityAudit = require('../../../shared/models/SecurityAudit');
const sessionService = require('../../../shared/services/session.service');
const { sendLoginAlertIfEnabled } = require('../services/auth.service');

// สร้าง refresh token สำหรับ OAuth user
function generateOAuthRefreshToken(user) {
  return jwt.sign(
    { id: user._id, type: 'refresh_token', jti: crypto.randomBytes(16).toString('hex') },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// สร้าง token อายุสั้นสำหรับยืนยันตัวตนก่อนลบบัญชี
function generateReauthToken(userId) {
  return jwt.sign(
    { userId: userId.toString(), purpose: 'delete_account', jti: crypto.randomBytes(16).toString('hex') },
    config.JWT_SECRET,
    { expiresIn: '5m' }
  );
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
  router.get('/google', (req, res, next) => {
    if (req.query.redirect) {
      req.session.oauthRedirect = req.query.redirect;
    }
    if (req.query.action === 'delete_account') {
      req.session.oauthAction = 'delete_account';
      req.session.oauthReturnTo = req.query.returnTo || '/profile.html';
    }
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account'
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
          return res.redirect(`${returnTo}?reauth_token=${reauthToken}&action=delete_account`);
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

        // สร้าง JWT token
        const token = jwt.sign(
          {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role,
            provider: 'google',
            jti: crypto.randomBytes(16).toString('hex')
          },
          config.JWT_SECRET,
          { expiresIn: config.JWT_EXPIRE || '1h' }
        );

        // สร้าง refresh token และ session
        const refreshToken = generateOAuthRefreshToken(req.user);
        let sessionId = null;
        try {
          const session = await sessionService.createSession(req.user._id, token, refreshToken, req);
          sessionId = session.sessionId;
        } catch (err) {
          logger.warn('Google OAuth: session creation failed (non-fatal):', err.message);
        }

        // ส่ง login alert email (ไม่รอผล)
        sendLoginAlertIfEnabled(req.user, req).catch(err => {
          logger.error('Google OAuth: login alert email failed:', err.message);
        });

        // ตั้งค่า cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600000
        });

        const redirectTo = req.session.oauthRedirect;
        delete req.session.oauthRedirect;
        const params = new URLSearchParams({ token, refreshToken: refreshToken });
        if (sessionId) params.set('sessionId', sessionId);
        res.redirect(redirectTo ? `${redirectTo}?${params}` : `/dashboard.html?${params}`);

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
  router.get('/github', (req, res, next) => {
    if (req.query.redirect) {
      req.session.oauthRedirect = req.query.redirect;
    }
    if (req.query.action === 'delete_account') {
      req.session.oauthAction = 'delete_account';
      req.session.oauthReturnTo = req.query.returnTo || '/profile.html';
    }
    passport.authenticate('github', {
      scope: ['user:email']
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
          return res.redirect(`${returnTo}?reauth_token=${reauthToken}&action=delete_account`);
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

        // สร้าง JWT token
        const token = jwt.sign(
          {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role,
            provider: 'github',
            jti: crypto.randomBytes(16).toString('hex')
          },
          config.JWT_SECRET,
          { expiresIn: config.JWT_EXPIRE || '1h' }
        );

        // สร้าง refresh token และ session
        const refreshToken = generateOAuthRefreshToken(req.user);
        let sessionId = null;
        try {
          const session = await sessionService.createSession(req.user._id, token, refreshToken, req);
          sessionId = session.sessionId;
        } catch (err) {
          logger.warn('GitHub OAuth: session creation failed (non-fatal):', err.message);
        }

        // ส่ง login alert email (ไม่รอผล)
        sendLoginAlertIfEnabled(req.user, req).catch(err => {
          logger.error('GitHub OAuth: login alert email failed:', err.message);
        });

        // ตั้งค่า cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600000
        });

        const redirectTo = req.session.oauthRedirect;
        delete req.session.oauthRedirect;
        const params = new URLSearchParams({ token, refreshToken });
        if (sessionId) params.set('sessionId', sessionId);
        res.redirect(redirectTo ? `${redirectTo}?${params}` : `/dashboard.html?${params}`);

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
