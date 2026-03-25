/**
 * GitHub OAuth Strategy
 * For GitHub login integration
 */

const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../../models/User');
const config = require('../config.js');

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
        console.log('[GitHub OAuth] Profile received:', {
            id: profile.id,
            username: profile.username,
            emails: profile.emails
        });

        // Check if user exists by GitHub ID
        let user = await User.findOne({ 'socialAccounts.github.id': profile.id });

        if (user) {
            console.log('[GitHub OAuth] Existing user found:', user.email);
            // Update last login
            user.lastLogin = new Date();
            user.socialAccounts.github.lastLogin = new Date();
            await user.save();
            return done(null, user);
        }

        // Check if user exists by email
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        
        if (email) {
            user = await User.findOne({ email });
            
            if (user) {
                console.log('[GitHub OAuth] Linking GitHub to existing user:', email);
                // Link GitHub account to existing user
                user.socialAccounts.github = {
                    id: profile.id,
                    username: profile.username,
                    accessToken,
                    refreshToken,
                    linkedAt: new Date(),
                    lastLogin: new Date()
                };
                user.lastLogin = new Date();
                await user.save();
                return done(null, user);
            }
        }

        // Create new user
        console.log('[GitHub OAuth] Creating new user');
        const username = profile.username || `github_${profile.id}`;
        const userEmail = email || `${username}@github.users`;

        user = new User({
            username,
            email: userEmail,
            emailVerified: !!email, // Verified if GitHub provided email
            socialAccounts: {
                github: {
                    id: profile.id,
                    username: profile.username,
                    accessToken,
                    refreshToken,
                    linkedAt: new Date(),
                    lastLogin: new Date()
                }
            },
            pdpaConsent: {
                essentialAccepted: true,
                essentialAcceptedAt: new Date(),
                policyVersion: '1.0.0',
                consentIp: req.ip || req.headers['x-forwarded-for']?.split(',')[0]
            }
        });

        await user.save();
        console.log('[GitHub OAuth] New user created:', user.email);

        return done(null, user);
    } catch (error) {
        console.error('[GitHub OAuth] Error:', error);
        return done(error, null);
    }
});

    module.exports = githubStrategy;
}
