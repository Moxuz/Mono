const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Generate 2FA secret for user
 */
async function generate2FASecret(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.twoFactorEnabled) {
      throw new Error('2FA is already enabled for this user');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Auth System (${user.email})`,
      issuer: 'Auth System',
      length: 32
    });

    // Save secret (encrypted)
    user.twoFactorSecret = encryptSecret(secret.base32);
    user.twoFactorTempSecret = encryptSecret(secret.base32); // Temporary, until verified
    await user.save();

    logger.info(`2FA secret generated for user: ${user.email}`);

    return {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url,
      qrCodeUrl: await QRCode.toDataURL(secret.otpauth_url)
    };
  } catch (error) {
    logger.error('Generate 2FA secret error:', error);
    throw error;
  }
}

/**
 * Verify 2FA token and enable 2FA
 */
async function verifyAndEnable2FA(userId, token) {
  try {
    const user = await User.findById(userId).select('+twoFactorSecret +twoFactorTempSecret');
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.twoFactorTempSecret) {
      throw new Error('No pending 2FA setup. Please generate secret first.');
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: decryptSecret(user.twoFactorTempSecret),
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 time steps of skew
    });

    if (!verified) {
      throw new Error('Invalid 2FA token');
    }

    // Enable 2FA
    user.twoFactorEnabled = true;
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = undefined;
    user.twoFactorVerifiedAt = new Date();
    await user.save();

    // Generate backup codes
    const backupCodes = await generateBackupCodes(userId);

    logger.info(`2FA enabled for user: ${user.email}`);

    return {
      message: '2FA enabled successfully',
      backupCodes
    };
  } catch (error) {
    logger.error('Verify 2FA error:', error);
    throw error;
  }
}

/**
 * Disable 2FA
 */
async function disable2FA(userId, token) {
  try {
    const user = await User.findById(userId).select('+twoFactorSecret');
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.twoFactorEnabled) {
      throw new Error('2FA is not enabled');
    }

    // Verify current token
    const verified = speakeasy.totp.verify({
      secret: decryptSecret(user.twoFactorSecret),
      encoding: 'base32',
      token: token,
      window: 2
    });

    if (!verified) {
      throw new Error('Invalid 2FA token');
    }

    // Disable 2FA
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorVerifiedAt = undefined;
    user.twoFactorBackupCodes = [];
    await user.save();

    logger.info(`2FA disabled for user: ${user.email}`);

    return { message: '2FA disabled successfully' };
  } catch (error) {
    logger.error('Disable 2FA error:', error);
    throw error;
  }
}

/**
 * Verify 2FA token (for login)
 */
async function verify2FAToken(user, token) {
  try {
    if (!user.twoFactorEnabled) {
      return true; // No 2FA required
    }

    const verified = speakeasy.totp.verify({
      secret: decryptSecret(user.twoFactorSecret),
      encoding: 'base32',
      token: token,
      window: 2
    });

    return verified;
  } catch (error) {
    logger.error('Verify 2FA token error:', error);
    return false;
  }
}

/**
 * Verify backup code
 */
async function verifyBackupCode(user, code) {
  try {
    if (!user.twoFactorEnabled || !user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
      return false;
    }

    // Check if code matches (case-insensitive)
    const normalizedCode = code.replace(/-/g, '').toLowerCase();
    const codeIndex = user.twoFactorBackupCodes.findIndex(
      c => c.replace(/-/g, '').toLowerCase() === normalizedCode
    );

    if (codeIndex === -1) {
      return false;
    }

    // Remove used code
    user.twoFactorBackupCodes.splice(codeIndex, 1);
    await user.save();

    return true;
  } catch (error) {
    logger.error('Verify backup code error:', error);
    return false;
  }
}

/**
 * Generate backup codes
 */
async function generateBackupCodes(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const codes = [];
    for (let i = 0; i < 10; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      // Format as XXXX-XXXX
      const formattedCode = `${code.substring(0, 4)}-${code.substring(4)}`;
      codes.push(formattedCode);
    }

    // Store hashed codes
    user.twoFactorBackupCodes = codes.map(code => hashBackupCode(code));
    user.twoFactorBackupCodesGeneratedAt = new Date();
    await user.save();

    logger.info(`Backup codes generated for user: ${user.email}`);

    return codes; // Return plain codes (only time they're shown)
  } catch (error) {
    logger.error('Generate backup codes error:', error);
    throw error;
  }
}

/**
 * Regenerate backup codes
 */
async function regenerateBackupCodes(userId, token) {
  try {
    const user = await User.findById(userId).select('+twoFactorSecret');
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.twoFactorEnabled) {
      throw new Error('2FA is not enabled');
    }

    // Verify current token
    const verified = speakeasy.totp.verify({
      secret: decryptSecret(user.twoFactorSecret),
      encoding: 'base32',
      token: token,
      window: 2
    });

    if (!verified) {
      throw new Error('Invalid 2FA token');
    }

    // Generate new codes
    const codes = await generateBackupCodes(userId);

    return {
      message: 'Backup codes regenerated',
      codes
    };
  } catch (error) {
    logger.error('Regenerate backup codes error:', error);
    throw error;
  }
}

/**
 * Get 2FA status
 */
async function get2FAStatus(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return {
      enabled: user.twoFactorEnabled,
      verified: user.twoFactorVerifiedAt !== null,
      backupCodesCount: user.twoFactorBackupCodes?.length || 0,
      verifiedAt: user.twoFactorVerifiedAt
    };
  } catch (error) {
    logger.error('Get 2FA status error:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;

if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY or JWT_SECRET environment variable is required');
}

function encryptSecret(secret) {
    const algorithm = 'aes-256-cbc';
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptSecret(encrypted) {
    const algorithm = 'aes-256-cbc';
    const parts = encrypted.split(':');
    if (parts.length !== 2) {
        throw new Error('Invalid encrypted secret format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function hashBackupCode(code) {
  return crypto.createHash('sha256').update(code.toLowerCase()).digest('hex');
}

module.exports = {
  generate2FASecret,
  verifyAndEnable2FA,
  disable2FA,
  verify2FAToken,
  verifyBackupCode,
  generateBackupCodes,
  regenerateBackupCodes,
  get2FAStatus
};
