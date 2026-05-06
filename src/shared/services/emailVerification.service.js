/**
 * Email Verification Service
 * Handles token generation, verification, and resend logic
 */

const crypto = require('crypto');
const User = require('../models/User');
const emailService = require('./email.service');
const logger = require('../utils/logger');
const config = require('../config/config');

class EmailVerificationService {
    /**
     * Generate and store a verification token for the user, then send the email.
     */
    async sendVerificationEmail(user) {
        const token = crypto.randomBytes(32).toString('hex');
        const hash = crypto.createHash('sha256').update(token).digest('hex');

        await User.updateOne(
            { _id: user._id },
            {
                emailVerificationToken: hash,
                emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
            }
        );

        const verificationUrl = `${config.AUTH_SERVER_URL}/api/auth/verify-email/${token}`;

        try {
            await emailService.sendVerificationEmail({
                to: user.email,
                username: user.username,
                verificationUrl,
            });
        } catch (err) {
            logger.warn('Could not send verification email:', err.message);
        }

        return token;
    }

    /**
     * Verify email using the raw token from the URL.
     */
    async verifyEmail(token) {
        if (!token) throw new Error('Verification token is required');

        const hash = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            emailVerificationToken: hash,
            emailVerificationExpires: { $gt: new Date() },
        });

        if (!user) throw new Error('Invalid or expired verification token');

        await User.updateOne(
            { _id: user._id },
            {
                emailVerified: true,
                emailVerificationToken: undefined,
                emailVerificationExpires: undefined,
            }
        );

        return user;
    }

    /**
     * Resend verification email for a given email address.
     */
    async resendVerificationEmail(email) {
        if (!email) throw new Error('Email is required');

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) return; // Do not reveal whether email exists

        if (user.emailVerified) throw new Error('Email is already verified');

        return this.sendVerificationEmail(user);
    }
}

module.exports = new EmailVerificationService();
