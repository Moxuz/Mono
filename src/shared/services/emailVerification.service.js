const crypto = require('crypto');
const User = require('../models/User');
const config = require('../config/config');
const emailService = require('./email.service');
const { getVerificationTemplate } = require('./email.templates');
const logger = require('../utils/logger');

/**
 * Generate email verification token
 */
async function generateVerificationToken(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.emailVerified) {
      throw new Error('Email already verified');
    }

    // Generate token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

    // Save hashed token with expiry (24 hours)
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    return verificationToken;
  } catch (error) {
    throw error;
  }
}

/**
 * Send verification email
 */
async function sendVerificationEmail(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.emailVerified) {
      return { message: 'Email already verified' };
    }

    // Generate token
    const verificationToken = await generateVerificationToken(userId);

    // Create verification URL
    const verificationUrl = `${config.AUTH_SERVER_URL}/api/auth/verify-email?token=${verificationToken}`;

    // Send email
    await emailService.sendEmail({
      to: user.email,
      subject: 'Verify your email address',
      html: getVerificationTemplate({ username: user.username, verificationUrl })
    });

    logger.info(`Verification email sent to ${user.email}`);

    return {
      message: 'Verification email sent successfully'
    };
  } catch (error) {
    logger.error('Send verification email error:', error);
    throw error;
  }
}

/**
 * Verify email with token
 */
async function verifyEmail(token) {
  try {
    if (!token) {
      throw new Error('Verification token is required');
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    logger.info(`Email verified for user: ${user.email}`);

    return {
      message: 'Email verified successfully',
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified
      }
    };
  } catch (error) {
    logger.error('Verify email error:', error);
    throw error;
  }
}

/**
 * Resend verification email
 */
async function resendVerificationEmail(email) {
  try {
    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if email exists
      return { message: 'If this email exists, a verification link has been sent' };
    }

    if (user.emailVerified) {
      return { message: 'Email is already verified' };
    }

    // Generate new token
    const verificationToken = await generateVerificationToken(user._id);

    // Create verification URL
    const verificationUrl = `${config.AUTH_SERVER_URL}/api/auth/verify-email?token=${verificationToken}`;

    // Send email
    await emailService.sendEmail({
      to: user.email,
      subject: 'Verify your email address',
      html: getVerificationTemplate({ username: user.username, verificationUrl })
    });

    logger.info(`Verification email resent to ${user.email}`);

    return { message: 'If this email exists, a verification link has been sent' };
  } catch (error) {
    logger.error('Resend verification email error:', error);
    throw error;
  }
}

module.exports = {
  generateVerificationToken,
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail
};
