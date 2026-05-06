/**
 * Two-Factor Authentication Service
 * Handles TOTP secret encryption/decryption and verification
 */

const crypto = require('crypto');
const config = require('../config/config');

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(config.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'), 'hex').slice(0, 32);

/**
 * Encrypt a TOTP secret before storing it in the database
 * @param {string} secret - Plain-text TOTP secret
 * @returns {string} - Encrypted secret (iv:encrypted hex)
 */
function encryptSecret(secret) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a stored TOTP secret
 * @param {string} encryptedSecret - Encrypted secret (iv:encrypted hex)
 * @returns {string} - Plain-text TOTP secret
 */
function decryptSecret(encryptedSecret) {
    const [ivHex, encryptedHex] = encryptedSecret.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
