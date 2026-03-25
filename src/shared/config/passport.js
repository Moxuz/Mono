// src/shared/config/passport.js

const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('./passport/github.strategy.js');
const FacebookStrategy = require('./passport/facebook.strategy.js');
const User           = require('../models/User');
const logger         = require('../utils/logger');

// ✅ เช็คก่อนว่ามี credentials ไหม
const GOOGLE_ENABLED =
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET;

const GITHUB_ENABLED =
  !!process.env.GITHUB_CLIENT_ID &&
  !!process.env.GITHUB_CLIENT_SECRET;

const FACEBOOK_ENABLED =
  !!process.env.FACEBOOK_APP_ID &&
  !!process.env.FACEBOOK_APP_SECRET;

// Google OAuth

console.log('🔍 Debug Google OAuth in passport.js:');
console.log('  GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 
    process.env.GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 
    '❌ UNDEFINED');
console.log('  GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 
    process.env.GOOGLE_CLIENT_SECRET.substring(0, 15) + '...' : 
    '❌ UNDEFINED');
console.log('  GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || '❌ UNDEFINED');
console.log('  GOOGLE_ENABLED:', GOOGLE_ENABLED);

if (GOOGLE_ENABLED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID:     process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:  process.env.GOOGLE_CALLBACK_URL,
      },
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

  logger.info('✅ Google OAuth enabled');
} else {
  logger.warn('⚠️  Google OAuth disabled — GOOGLE_CLIENT_ID not set');
}

// GitHub OAuth
if (GITHUB_ENABLED && GitHubStrategy) {
  passport.use(GitHubStrategy);
  logger.info('✅ GitHub OAuth enabled');
} else if (GITHUB_ENABLED && !GitHubStrategy) {
  logger.warn('⚠️  GitHub OAuth enabled but strategy not loaded');
} else {
  logger.warn('⚠️  GitHub OAuth disabled — GITHUB_CLIENT_ID not set');
}

// Facebook OAuth
if (FACEBOOK_ENABLED && FacebookStrategy) {
  passport.use(FacebookStrategy);
  logger.info('✅ Facebook OAuth enabled');
} else if (FACEBOOK_ENABLED && !FacebookStrategy) {
  logger.warn('⚠️  Facebook OAuth enabled but strategy not loaded');
} else {
  logger.warn('⚠️  Facebook OAuth disabled — FACEBOOK_APP_ID not set');
}

passport.serializeUser((user, done)       => done(null, user.id));
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
  GITHUB_ENABLED,   
  FACEBOOK_ENABLED  
};