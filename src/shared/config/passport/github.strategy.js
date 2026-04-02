/**
 * GitHub OAuth Strategy
 * For GitHub login integration
 */

const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../../models/User');
const config = require('../config.js');
const logger = require('../../utils/logger');

// Check if GitHub OAuth is enabled
const GITHUB_ENABLED = config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET;

if (!GITHUB_ENABLED) {
    module.exports = null;
} else {
    /**
     * GitHub OAuth Strategy Configuration
     */
    const githubStrategy = new GitHubStrategy({
        clientID: config.GITHUB_CLIENT_ID,
        clientSecret: config.GITHUB_CLIENT_SECRET,
        callbackURL: config.GITHUB_CALLBACK_URL,
        scope: ['user:email'],
        passReqToCallback: true
    }, async (req, accessToken, refreshToken, profile, done) => {
    try {
        // Check if user exists by GitHub ID
        let user = await User.findOne({ githubId: profile.id });

        if (user) {
            logger.info(`GitHub OAuth: existing user login: ${user.email}`);
            user.lastLogin = new Date();
            await user.save();
            return done(null, user);
        }

        // Check if user exists by email
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;

        if (email) {
            user = await User.findOne({ email });

            if (user) {
                logger.info(`GitHub OAuth: linking GitHub to existing user: ${email}`);
                user.githubId = profile.id;
                user.lastLogin = new Date();
                if (profile.photos && profile.photos[0]) user.avatar = profile.photos[0].value;
                await user.save();
                return done(null, user);
            }
        }

        // Create new user
        const username = profile.username || `github_${profile.id}`;
        const userEmail = email || `${username}@github.users`;

        user = new User({
            username,
            email: userEmail,
            githubId: profile.id,
            avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
            pdpaConsent: {
                essentialAccepted: true,
                essentialAcceptedAt: new Date(),
                policyVersion: '1.0.0',
                consentIp: req.ip || req.headers['x-forwarded-for']?.split(',')[0]
            }
        });

        await user.save();
        logger.info(`GitHub OAuth: new user created: ${user.email}`);

        return done(null, user);
    } catch (error) {
        logger.error('GitHub OAuth error:', error.message);
        return done(error, null);
    }
});

    module.exports = githubStrategy;
}
