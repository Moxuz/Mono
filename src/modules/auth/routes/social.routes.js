// src/modules/auth/routes/social.routes.js

const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const config = require('../../../shared/config/config');
const logger = require('../../../shared/utils/logger');
const SecurityAudit = require('../../../shared/models/SecurityAudit');

// ✅ Import enabled flags from passport config
const { 
  GOOGLE_ENABLED, 
  GITHUB_ENABLED, 
  FACEBOOK_ENABLED 
} = require('../../../shared/config/passport');

/**
 * @swagger
 * tags:
 *   name: Social Login
 *   description: OAuth authentication (Google, GitHub, Facebook)
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
  router.get('/google', (req, res, next) => {
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account' // ✅ ใช้ได้กับ Google
    })(req, res, next);
  });

  /**
   * @swagger
   * /api/auth/google/callback:
   *   get:
   *     summary: Google OAuth callback
   *     tags: [Social Login]
   */
  router.get('/google/callback',
    passport.authenticate('google', { 
      session: false,
      failureRedirect: '/login.html?error=google_failed' 
    }),
    async (req, res) => {
      try {
        logger.info(`✅ Google login successful: ${req.user.email}`);

        // Log security event
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

        // Generate JWT token
        const token = jwt.sign(
          {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role,
            provider: 'google'
          },
          config.JWT_SECRET,
          { expiresIn: config.JWT_EXPIRE || '1h' }
        );

        // Set cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600000 // 1 hour
        });

        // Redirect to dashboard
        res.redirect(`/dashboard.html?token=${token}`);

      } catch (error) {
        logger.error('❌ Google callback error:', error);
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
  router.get('/github', (req, res, next) => {
    passport.authenticate('github', {
      scope: ['user:email'] // ✅ GitHub ใช้ scope แบบนี้
      // ❌ ไม่ใช้ prompt: 'select_account' (นั่นเป็นของ Google)
    })(req, res, next);
  });

  /**
   * @swagger
   * /api/auth/github/callback:
   *   get:
   *     summary: GitHub OAuth callback
   *     tags: [Social Login]
   */
  router.get('/github/callback',
    passport.authenticate('github', { 
      session: false,
      failureRedirect: '/login.html?error=github_failed' 
    }),
    async (req, res) => {
      try {
        logger.info(`✅ GitHub login successful: ${req.user.email || req.user.username}`);

        // Log security event
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

        // Generate JWT token
        const token = jwt.sign(
          {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role,
            provider: 'github'
          },
          config.JWT_SECRET,
          { expiresIn: config.JWT_EXPIRE || '1h' }
        );

        // Set cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600000 // 1 hour
        });

        // Redirect to dashboard
        res.redirect(`/dashboard.html?token=${token}`);

      } catch (error) {
        logger.error('❌ GitHub callback error:', error);
        res.redirect('/login.html?error=github_callback_error');
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FACEBOOK OAUTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/facebook:
 *   get:
 *     summary: Initiate Facebook login
 *     tags: [Social Login]
 */
if (FACEBOOK_ENABLED) {
  router.get('/facebook', (req, res, next) => {
    passport.authenticate('facebook', {
      scope: ['email']
    })(req, res, next);
  });

  /**
   * @swagger
   * /api/auth/facebook/callback:
   *   get:
   *     summary: Facebook OAuth callback
   *     tags: [Social Login]
   */
  router.get('/facebook/callback',
    passport.authenticate('facebook', { 
      session: false,
      failureRedirect: '/login.html?error=facebook_failed' 
    }),
    async (req, res) => {
      try {
        logger.info(`✅ Facebook login successful: ${req.user.email}`);

        // Log security event
        await SecurityAudit.create({
          action: 'login_success',
          userId: req.user._id,
          status: 'success',
          ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
          userAgent: req.headers['user-agent'],
          metadata: {
            method: 'facebook',
            email: req.user.email,
            provider: 'facebook'
          }
        });

        // Generate JWT token
        const token = jwt.sign(
          {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role,
            provider: 'facebook'
          },
          config.JWT_SECRET,
          { expiresIn: config.JWT_EXPIRE || '1h' }
        );

        // Set cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600000 // 1 hour
        });

        // Redirect to dashboard
        res.redirect(`/dashboard.html?token=${token}`);

      } catch (error) {
        logger.error('❌ Facebook callback error:', error);
        res.redirect('/login.html?error=facebook_callback_error');
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
router.get('/oauth/status', (req, res) => {
  res.json({
    success: true,
    data: {
      google: GOOGLE_ENABLED,
      github: GITHUB_ENABLED,
      facebook: FACEBOOK_ENABLED
    }
  });
});

module.exports = router;