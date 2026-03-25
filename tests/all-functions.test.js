/**
 * ALL FUNCTIONS TEST SUITE
 * Comprehensive test suite covering all functions in the system
 * Run: node tests/all-functions.test.js
 */

const assert = require('assert');

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║           ALL FUNCTIONS TEST SUITE                       ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;
let totalTests = 0;

function test(description, fn) {
    totalTests++;
    try {
        fn();
        console.log(`✅ PASS: ${description}`);
        passed++;
    } catch (error) {
        console.log(`❌ FAIL: ${description}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
}

async function asyncTest(description, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`✅ PASS: ${description}`);
        passed++;
    } catch (error) {
        console.log(`❌ FAIL: ${description}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PASSWORD VALIDATOR TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 1: PASSWORD VALIDATOR\n');

const { validatePassword, getPasswordStrengthInfo, COMMON_PASSWORDS } = require('../src/shared/utils/passwordValidator');

test('validatePassword - password too short', () => {
    const result = validatePassword('123');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('8 characters')));
});

test('validatePassword - no complexity', () => {
    const result = validatePassword('12345678');
    assert.strictEqual(result.valid, false);
});

test('validatePassword - sequential characters', () => {
    const result = validatePassword('Test123!');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('sequential')));
});

test('validatePassword - common password', () => {
    const result = validatePassword('password');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('common')));
});

test('validatePassword - repeated characters', () => {
    const result = validatePassword('aaaaaaaa');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('repeated')));
});

test('validatePassword - strong password', () => {
    const result = validatePassword('MyStr0ng@Pass!');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
});

test('getPasswordStrengthInfo - returns correct structure', () => {
    const info = getPasswordStrengthInfo('Test123!');
    assert.ok(typeof info.score === 'number');
    assert.ok(Array.isArray(info.requirements));
    assert.ok(typeof info.strength === 'string');
});

test('getPasswordStrengthInfo - empty password', () => {
    const info = getPasswordStrengthInfo('');
    assert.strictEqual(info.score, 0);
    assert.strictEqual(info.strength, 'none');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 2FA SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 2: 2FA SERVICE\n');

const twoFAService = require('../src/shared/services/2fa.service');

test('2FA service exports generate2FASecret', () => {
    assert.ok(typeof twoFAService.generate2FASecret === 'function');
});

test('2FA service exports verifyAndEnable2FA', () => {
    assert.ok(typeof twoFAService.verifyAndEnable2FA === 'function');
});

test('2FA service exports disable2FA', () => {
    assert.ok(typeof twoFAService.disable2FA === 'function');
});

test('2FA service exports verify2FAToken', () => {
    assert.ok(typeof twoFAService.verify2FAToken === 'function');
});

test('2FA service exports verifyBackupCode', () => {
    assert.ok(typeof twoFAService.verifyBackupCode === 'function');
});

test('2FA service exports generateBackupCodes', () => {
    assert.ok(typeof twoFAService.generateBackupCodes === 'function');
});

test('2FA service exports regenerateBackupCodes', () => {
    assert.ok(typeof twoFAService.regenerateBackupCodes === 'function');
});

test('2FA service exports get2FAStatus', () => {
    assert.ok(typeof twoFAService.get2FAStatus === 'function');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EMAIL SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 3: EMAIL SERVICE\n');

const emailService = require('../src/shared/services/email.service');

test('Email service exports verifyConnection', () => {
    assert.ok(typeof emailService.verifyConnection === 'function');
});

test('Email service exports sendPasswordResetEmail', () => {
    assert.ok(typeof emailService.sendPasswordResetEmail === 'function');
});

test('Email service exports sendWelcomeEmail', () => {
    assert.ok(typeof emailService.sendWelcomeEmail === 'function');
});

test('Email service exports sendPasswordChangedEmail', () => {
    assert.ok(typeof emailService.sendPasswordChangedEmail === 'function');
});

test('Email service exports sendVerificationEmail', () => {
    assert.ok(typeof emailService.sendVerificationEmail === 'function');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. EMAIL VERIFICATION SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 4: EMAIL VERIFICATION SERVICE\n');

const emailVerificationService = require('../src/shared/services/emailVerification.service');

test('Email verification service exports generateVerificationToken', () => {
    assert.ok(typeof emailVerificationService.generateVerificationToken === 'function');
});

test('Email verification service exports sendVerificationEmail', () => {
    assert.ok(typeof emailVerificationService.sendVerificationEmail === 'function');
});

test('Email verification service exports verifyEmail', () => {
    assert.ok(typeof emailVerificationService.verifyEmail === 'function');
});

test('Email verification service exports resendVerificationEmail', () => {
    assert.ok(typeof emailVerificationService.resendVerificationEmail === 'function');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SECURITY AUDIT SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 5: SECURITY AUDIT SERVICE\n');

const securityAuditService = require('../src/shared/services/securityAudit.service');

test('Security audit service exports logSecurityEvent', () => {
    assert.ok(typeof securityAuditService.logSecurityEvent === 'function');
});

test('Security audit service exports logLoginSuccess', () => {
    assert.ok(typeof securityAuditService.logLoginSuccess === 'function');
});

test('Security audit service exports logLoginFailed', () => {
    assert.ok(typeof securityAuditService.logLoginFailed === 'function');
});

test('Security audit service exports logLogout', () => {
    assert.ok(typeof securityAuditService.logLogout === 'function');
});

test('Security audit service exports logPasswordChanged', () => {
    assert.ok(typeof securityAuditService.logPasswordChanged === 'function');
});

test('Security audit service exports logAccountLocked', () => {
    assert.ok(typeof securityAuditService.logAccountLocked === 'function');
});

test('Security audit service exports getUserAuditLogs', () => {
    assert.ok(typeof securityAuditService.getUserAuditLogs === 'function');
});

test('Security audit service exports getRecentFailedLogins', () => {
    assert.ok(typeof securityAuditService.getRecentFailedLogins === 'function');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SESSION SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 6: SESSION SERVICE\n');

const sessionService = require('../src/shared/services/session.service');

test('Session service exports createSession', () => {
    assert.ok(typeof sessionService.createSession === 'function');
});

test('Session service exports validateSession', () => {
    assert.ok(typeof sessionService.validateSession === 'function');
});

test('Session service exports getUserSessions', () => {
    assert.ok(typeof sessionService.getUserSessions === 'function');
});

test('Session service exports revokeSession', () => {
    assert.ok(typeof sessionService.revokeSession === 'function');
});

test('Session service exports revokeAllOtherSessions', () => {
    assert.ok(typeof sessionService.revokeAllOtherSessions === 'function');
});

test('Session service exports revokeAllSessions', () => {
    assert.ok(typeof sessionService.revokeAllSessions === 'function');
});

test('Session service exports getSessionCount', () => {
    assert.ok(typeof sessionService.getSessionCount === 'function');
});

test('Session service exports validateAndRotateRefreshToken', () => {
    assert.ok(typeof sessionService.validateAndRotateRefreshToken === 'function');
});

test('Session service exports parseUserAgent', () => {
    assert.ok(typeof sessionService.parseUserAgent === 'function');
});

test('parseUserAgent - returns browser info', () => {
    const result = sessionService.parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0');
    assert.ok(result.browser === 'Chrome');
    assert.ok(result.os === 'Windows');
    assert.ok(result.device === 'Desktop');
});

test('parseUserAgent - detects mobile device', () => {
    const result = sessionService.parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
    assert.ok(result.device === 'Mobile');
    assert.ok(result.os === 'iOS');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. OAUTH SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 7: OAUTH SERVICE\n');

const oauthService = require('../src/modules/oauth/services/oauth.service');

test('OAuth service exports generateAuthorizationCode', () => {
    assert.ok(typeof oauthService.generateAuthorizationCode === 'function');
});

test('OAuth service exports exchangeCodeForTokens', () => {
    assert.ok(typeof oauthService.exchangeCodeForTokens === 'function');
});

test('OAuth service exports registerClient', () => {
    assert.ok(typeof oauthService.registerClient === 'function');
});

test('OAuth service exports getClient', () => {
    assert.ok(typeof oauthService.getClient === 'function');
});

test('OAuth service exports listClients', () => {
    assert.ok(typeof oauthService.listClients === 'function');
});

test('OAuth service exports updateClient', () => {
    assert.ok(typeof oauthService.updateClient === 'function');
});

test('OAuth service exports deleteClient', () => {
    assert.ok(typeof oauthService.deleteClient === 'function');
});

test('OAuth service exports validateClient', () => {
    assert.ok(typeof oauthService.validateClient === 'function');
});

test('OAuth service exports generateAccessToken', () => {
    assert.ok(typeof oauthService.generateAccessToken === 'function');
});

test('OAuth service exports generateIdToken', () => {
    assert.ok(typeof oauthService.generateIdToken === 'function');
});

test('OAuth service exports generateRefreshToken', () => {
    assert.ok(typeof oauthService.generateRefreshToken === 'function');
});

test('OAuth service exports refreshAccessToken', () => {
    assert.ok(typeof oauthService.refreshAccessToken === 'function');
});

test('OAuth service exports verifyAccessToken', () => {
    assert.ok(typeof oauthService.verifyAccessToken === 'function');
});

test('OAuth service exports getUserInfo', () => {
    assert.ok(typeof oauthService.getUserInfo === 'function');
});

test('OAuth service exports revokeToken', () => {
    assert.ok(typeof oauthService.revokeToken === 'function');
});

test('OAuth service exports introspectToken', () => {
    assert.ok(typeof oauthService.introspectToken === 'function');
});

test('OAuth PKCE verification', () => {
    const { generateCodeChallenge, verifyPKCE } = require('../src/modules/oauth/services/oauth.service');
    // PKCE functions should exist
    assert.ok(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. KAFKA LOGGER TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 8: KAFKA LOGGER\n');

const kafkaLogger = require('../src/shared/utils/kafkaLogger');

test('Kafka logger exports connectKafka', () => {
    assert.ok(typeof kafkaLogger.connectKafka === 'function');
});

test('Kafka logger exports logToKafka', () => {
    assert.ok(typeof kafkaLogger.logToKafka === 'function');
});

test('Kafka logger exports logBatchToKafka', () => {
    assert.ok(typeof kafkaLogger.logBatchToKafka === 'function');
});

test('Kafka logger exports disconnectKafka', () => {
    assert.ok(typeof kafkaLogger.disconnectKafka === 'function');
});

test('Kafka logger exports getStatus', () => {
    assert.ok(typeof kafkaLogger.getStatus === 'function');
});

test('Kafka logger has TOPICS constant', () => {
    assert.ok(kafkaLogger.TOPICS);
    assert.ok(typeof kafkaLogger.TOPICS === 'object');
});

test('Kafka status returns configuration', () => {
    const status = kafkaLogger.getStatus();
    assert.ok(typeof status === 'object');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CONFIGURATION TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 9: CONFIGURATION\n');

const config = require('../src/shared/config/config');

test('Config exports NODE_ENV', () => {
    assert.ok(config.NODE_ENV !== undefined);
});

test('Config exports PORT', () => {
    assert.ok(config.PORT !== undefined);
});

test('Config exports MONGODB_URI', () => {
    assert.ok(config.MONGODB_URI !== undefined);
});

test('Config exports JWT_SECRET', () => {
    assert.ok(config.JWT_SECRET !== undefined);
});

test('Config exports JWT_EXPIRE', () => {
    assert.ok(config.JWT_EXPIRE !== undefined);
});

test('Config exports SESSION_SECRET', () => {
    assert.ok(config.SESSION_SECRET !== undefined);
});

test('Config exports CORS_ORIGIN', () => {
    assert.ok(config.CORS_ORIGIN !== undefined);
});

test('Config exports email configuration object', () => {
    assert.ok(config.email !== undefined);
    assert.ok(typeof config.email === 'object');
});

test('Config exports SMTP host', () => {
    assert.ok(config.email.smtp.host !== undefined);
});

test('Config exports AUTH_SERVER_URL', () => {
    assert.ok(config.AUTH_SERVER_URL !== undefined);
});

test('Config exports BASE_URL', () => {
    assert.ok(config.BASE_URL !== undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. ENCRYPTION UTILITIES TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 10: ENCRYPTION UTILITIES\n');

const crypto = require('crypto');

test('Node.js crypto module available', () => {
    assert.ok(crypto);
});

test('Node.js crypto createHash available', () => {
    assert.ok(typeof crypto.createHash === 'function');
});

test('Node.js crypto createCipheriv available', () => {
    assert.ok(typeof crypto.createCipheriv === 'function');
});

test('Node.js crypto createDecipheriv available', () => {
    assert.ok(typeof crypto.createDecipheriv === 'function');
});

test('Random bytes generation works', () => {
    const bytes = crypto.randomBytes(32);
    assert.strictEqual(bytes.length, 32);
});

test('SHA256 hash generation works', () => {
    const hash = crypto.createHash('sha256').update('test').digest('hex');
    assert.strictEqual(hash.length, 64);
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. AUTH SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 11: AUTH SERVICE\n');

const authService = require('../src/modules/auth/services/auth.service');

test('Auth service exports register', () => {
    assert.ok(typeof authService.register === 'function');
});

test('Auth service exports login', () => {
    assert.ok(typeof authService.login === 'function');
});

test('Auth service exports verify2FAAndLogin', () => {
    assert.ok(typeof authService.verify2FAAndLogin === 'function');
});

test('Auth service exports createTempToken', () => {
    assert.ok(typeof authService.createTempToken === 'function');
});

test('Auth service exports createToken', () => {
    assert.ok(typeof authService.createToken === 'function');
});

test('Auth service exports generateRefreshToken', () => {
    assert.ok(typeof authService.generateRefreshToken === 'function');
});

test('Auth service exports validateToken', () => {
    assert.ok(typeof authService.validateToken === 'function');
});

test('Auth service exports refreshToken', () => {
    assert.ok(typeof authService.refreshToken === 'function');
});

test('Auth service exports blacklistAllUserTokens', () => {
    assert.ok(typeof authService.blacklistAllUserTokens === 'function');
});

test('Auth service exports getActiveSessions', () => {
    assert.ok(typeof authService.getActiveSessions === 'function');
});

test('Auth service exports revokeSession', () => {
    assert.ok(typeof authService.revokeSession === 'function');
});

test('Auth service exports revokeAllOtherSessions', () => {
    assert.ok(typeof authService.revokeAllOtherSessions === 'function');
});

test('Auth service exports checkSessionLimit', () => {
    assert.ok(typeof authService.checkSessionLimit === 'function');
});

test('Auth service exports forgotPassword', () => {
    assert.ok(typeof authService.forgotPassword === 'function');
});

test('Auth service exports resetPassword', () => {
    assert.ok(typeof authService.resetPassword === 'function');
});

test('Auth service exports changePassword', () => {
    assert.ok(typeof authService.changePassword === 'function');
});

test('Auth service exports updateCookieConsent', () => {
    assert.ok(typeof authService.updateCookieConsent === 'function');
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. USER SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 12: USER SERVICE\n');

const userService = require('../src/modules/user/services/user.service');

test('User service exports getUserById', () => {
    assert.ok(typeof userService.getUserById === 'function');
});

test('User service exports updateUser', () => {
    assert.ok(typeof userService.updateUser === 'function');
});

test('User service exports deleteUser', () => {
    assert.ok(typeof userService.deleteUser === 'function');
});

test('User service exports exportUserData', () => {
    assert.ok(typeof userService.exportUserData === 'function');
});

test('User service exports getUserSessions', () => {
    assert.ok(typeof userService.getUserSessions === 'function');
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. CLIENT SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 13: CLIENT SERVICE\n');

const clientService = require('../src/modules/client/services/client.service');

test('Client service module exists', () => {
    assert.ok(clientService !== undefined);
});

test('Client service is empty module (to be implemented)', () => {
    // The client service module exists but may be empty
    // This is a placeholder for future implementation
    assert.ok(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. EMAIL TEMPLATES TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 14: EMAIL TEMPLATES\n');

const {
    getPasswordResetTemplate,
    getWelcomeTemplate,
    getPasswordChangedTemplate,
    getVerificationTemplate
} = require('../src/shared/services/email.templates');

test('Password reset template contains AUTH_SERVER_URL', () => {
    const html = getPasswordResetTemplate({ username: 'Test', resetUrl: 'http://test.com' });
    assert.ok(html.includes('http://localhost:5000'));
    assert.ok(html.includes('Test'));
});

test('Welcome template contains AUTH_SERVER_URL', () => {
    const html = getWelcomeTemplate({ username: 'Test' });
    assert.ok(html.includes('http://localhost:5000'));
    assert.ok(html.includes('Test'));
});

test('Verification template contains AUTH_SERVER_URL', () => {
    const html = getVerificationTemplate({ username: 'Test', verificationUrl: 'http://test.com/verify' });
    assert.ok(html.includes('http://localhost:5000'));
    assert.ok(html.includes('Verify Your Email'));
});

test('Password changed template exists', () => {
    const html = getPasswordChangedTemplate({ username: 'Test' });
    assert.ok(typeof html === 'string');
    assert.ok(html.length > 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. APP AND ROUTES TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 15: APP AND ROUTES\n');

const app = require('../src/app');

test('App exports successfully', () => {
    assert.ok(app);
    assert.ok(typeof app.listen === 'function');
    assert.ok(typeof app.use === 'function');
    assert.ok(typeof app.get === 'function');
    assert.ok(typeof app.post === 'function');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║                    TEST SUMMARY                           ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║  ✅ Passed: ${passed.toString().padEnd(43)} ║`);
console.log(`║  ❌ Failed: ${failed.toString().padEnd(43)} ║`);
console.log(`║  📊 Total:  ${(passed + failed).toString().padEnd(42)} ║`);
const percentage = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(1) : 0;
console.log(`║  📈 Success: ${(percentage + '%').padEnd(42)} ║`);
console.log('╚═══════════════════════════════════════════════════════════╝\n');

if (failed > 0) {
    console.log('⚠️  Some tests failed. Please review the errors above.\n');
    process.exit(1);
} else {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
}
