// src/shared/config/passport.js

const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('./passport/github.strategy.js');
const User           = require('../models/User');
const logger         = require('../utils/logger');
const config         = require('./config');

// ตรวจสอบว่ามี credentials ของ OAuth providers หรือไม่
const GOOGLE_ENABLED =
  !!config.GOOGLE_CLIENT_ID &&
  !!config.GOOGLE_CLIENT_SECRET;

const GITHUB_ENABLED =
  !!config.GITHUB_CLIENT_ID &&
  !!config.GITHUB_CLIENT_SECRET;

// ลงทะเบียน Google OAuth Strategy ถ้ามี credentials
if (GOOGLE_ENABLED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID:     config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL:  config.GOOGLE_CALLBACK_URL,
      },
      // ค้นหาหรือสร้าง user จากข้อมูล Google profile
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email    = profile.emails?.[0]?.value;
          const googleId = profile.id;
          const username = profile.displayName || email?.split('@')[0];

          if (!email) return done(new Error('No email from Google'), null);

          let user = await User.findOne({ $or: [{ googleId }, { email }] });

          if (user) {
            if (!user.googleId) {
              user.googleId = googleId;
              await user.save();
            }
            return done(null, user);
          }

          const now = new Date();
          user = await User.create({
            username,
            email,
            googleId,
            isActive:    true,
            pdpaConsent: {
              essentialAccepted:   true,
              essentialAcceptedAt: now,
              policyVersion:       '1.0.0',
            },
          });

          logger.info(`New user via Google: ${email}`);
          return done(null, user);

        } catch (error) {
          logger.error('Google OAuth error:', error.message);
          return done(error, null);
        }
      }
    )
  );

  logger.info('Google OAuth enabled');
} else {
  logger.warn('Google OAuth disabled — GOOGLE_CLIENT_ID not set');
}

// ลงทะเบียน GitHub OAuth Strategy ถ้ามี credentials
if (GITHUB_ENABLED && GitHubStrategy) {
  passport.use(GitHubStrategy);
  logger.info('GitHub OAuth enabled');
} else if (GITHUB_ENABLED && !GitHubStrategy) {
  logger.warn('GitHub OAuth enabled but strategy not loaded');
} else {
  logger.warn('GitHub OAuth disabled — GITHUB_CLIENT_ID not set');
}

// บันทึก user id ลง session
passport.serializeUser((user, done)       => done(null, user.id));

// ดึงข้อมูล user จาก id ที่บันทึกใน session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = {
  passport,
  GOOGLE_ENABLED,
  GITHUB_ENABLED
};
