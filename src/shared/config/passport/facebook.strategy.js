/**
 * Facebook OAuth Strategy
 * For Facebook login integration
 */

const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../../models/User');
const config = require('../config.js');

// Check if Facebook OAuth is enabled
const FACEBOOK_ENABLED = config.FACEBOOK_APP_ID && config.FACEBOOK_APP_SECRET;

if (!FACEBOOK_ENABLED) {
    module.exports = null;
} else {
    /**
     * Facebook OAuth Strategy Configuration
     */
    const facebookStrategy = new FacebookStrategy({
        clientID: config.FACEBOOK_APP_ID,
        clientSecret: config.FACEBOOK_APP_SECRET,
        callbackURL: config.FACEBOOK_CALLBACK_URL,
        profileFields: ['id', 'displayName', 'emails', 'name', 'picture'],
        passReqToCallback: true
    }, async (req, accessToken, refreshToken, profile, done) => {
        try {
            console.log('[Facebook OAuth] Profile received:', {
                id: profile.id,
                displayName: profile.displayName,
                emails: profile.emails
            });

            // Check if user exists by Facebook ID
            let user = await User.findOne({ 'socialAccounts.facebook.id': profile.id });

            if (user) {
                console.log('[Facebook OAuth] Existing user found:', user.email);
                // Update last login
                user.lastLogin = new Date();
                user.socialAccounts.facebook.lastLogin = new Date();
                await user.save();
                return done(null, user);
            }

            // Check if user exists by email
            const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            
            if (email) {
                user = await User.findOne({ email });
                
                if (user) {
                    console.log('[Facebook OAuth] Linking Facebook to existing user:', email);
                    // Link Facebook account to existing user
                    user.socialAccounts.facebook = {
                        id: profile.id,
                        displayName: profile.displayName,
                        accessToken,
                        refreshToken,
                        picture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                        linkedAt: new Date(),
                        lastLogin: new Date()
                    };
                    user.lastLogin = new Date();
                    await user.save();
                    return done(null, user);
                }
            }

            // Create new user
            console.log('[Facebook OAuth] Creating new user');
            const firstName = profile.name ? profile.name.givenName : '';
            const lastName = profile.name ? profile.name.familyName : '';
            const username = firstName + lastName || `facebook_${profile.id}`;
            const userEmail = email || `${username}@facebook.users`;

            user = new User({
                username: username.replace(/\s/g, '.').toLowerCase(),
                email: userEmail,
                emailVerified: !!email, // Verified if Facebook provided email
                socialAccounts: {
                    facebook: {
                        id: profile.id,
                        displayName: profile.displayName,
                        accessToken,
                        refreshToken,
                        picture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
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
            console.log('[Facebook OAuth] New user created:', user.email);

            return done(null, user);
        } catch (error) {
            console.error('[Facebook OAuth] Error:', error);
            return done(error, null);
        }
    });

    module.exports = facebookStrategy;
}
