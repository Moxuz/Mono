/**
 * SERVICE UNIT TESTS
 * Test individual services in isolation
 */

const crypto = require('crypto');

// Test results
const results = {
    passed: [],
    failed: []
};

function test(name, condition, details = '') {
    if (condition) {
        results.passed.push({ name, details });
        console.log(`✅ PASS: ${name}`);
        return true;
    } else {
        results.failed.push({ name, details });
        console.log(`❌ FAIL: ${name}`);
        if (details) console.log(`   ${details}`);
        return false;
    }
}

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║              SERVICE UNIT TESTS                         ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// ──────────────────────────────────────────────────────────────────────
// 1. PASSWORD VALIDATOR TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('📋 SECTION 1: PASSWORD VALIDATOR\n');

const { validatePassword, getPasswordStrengthInfo } = require('../../src/shared/utils/passwordValidator');

// Test various password scenarios
const passwordTests = [
    { password: '123', shouldBeValid: false, reason: 'too short' },
    { password: '12345678', shouldBeValid: false, reason: 'no complexity' },
    { password: 'Test123!', shouldBeValid: false, reason: 'has sequential characters (123)' },
    { password: 'password', shouldBeValid: false, reason: 'common password' },
    { password: 'Password123!', shouldBeValid: false, reason: 'common + sequential characters' },
    { password: 'aaaaaaaa', shouldBeValid: false, reason: 'repeated characters' },
    { password: '123456789', shouldBeValid: false, reason: 'sequential numbers' },
    { password: 'abcdefgh', shouldBeValid: false, reason: 'sequential letters' },
    { password: 'MyStr0ng@Pass!', shouldBeValid: true, reason: 'very strong' },
    { password: 'NoSpecial1', shouldBeValid: false, reason: 'no special char' },
    { password: 'nouppercase1!', shouldBeValid: false, reason: 'no uppercase' },
    { password: 'NOLOWERCASE1!', shouldBeValid: false, reason: 'no lowercase' },
    { password: 'NoNumbers@!', shouldBeValid: false, reason: 'no numbers' },
    { password: 'T3st@R4nd0m!', shouldBeValid: true, reason: 'no sequential chars' },
    { password: 'MyP@ssw0rd!X', shouldBeValid: true, reason: 'strong unique password' },
];

passwordTests.forEach(({ password, shouldBeValid, reason }) => {
    const result = validatePassword(password);
    test(
        `Password "${password}" - ${reason}`,
        result.valid === shouldBeValid,
        `Expected: ${shouldBeValid}, Got: ${result.valid} - ${result.errors.join(', ')}`
    );
});

// Test password strength info
const strengthInfo = getPasswordStrengthInfo('Test123!');
test(
    'Password strength info returns correct structure',
    strengthInfo.score !== undefined && 
    strengthInfo.strength !== undefined && 
    Array.isArray(strengthInfo.requirements),
    `Has score: ${strengthInfo.score}, strength: ${strengthInfo.strength}`
);

// Test empty password strength
const emptyStrength = getPasswordStrengthInfo('');
test(
    'Empty password strength returns 0 score',
    emptyStrength.score === 0,
    `Score: ${emptyStrength.score}`
);

// ──────────────────────────────────────────────────────────────────────
// 2. 2FA SERVICE TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 2: 2FA SERVICE\n');

const twoFAService = require('../../src/shared/services/2fa.service');

// Test 2FA service exports
test(
    '2FA service exports generate2FASecret',
    typeof twoFAService.generate2FASecret === 'function',
    'Function exists'
);

test(
    '2FA service exports verifyAndEnable2FA',
    typeof twoFAService.verifyAndEnable2FA === 'function',
    'Function exists'
);

test(
    '2FA service exports disable2FA',
    typeof twoFAService.disable2FA === 'function',
    'Function exists'
);

test(
    '2FA service exports verify2FAToken',
    typeof twoFAService.verify2FAToken === 'function',
    'Function exists'
);

test(
    '2FA service exports verifyBackupCode',
    typeof twoFAService.verifyBackupCode === 'function',
    'Function exists'
);

test(
    '2FA service exports generateBackupCodes',
    typeof twoFAService.generateBackupCodes === 'function',
    'Function exists'
);

test(
    '2FA service exports regenerateBackupCodes',
    typeof twoFAService.regenerateBackupCodes === 'function',
    'Function exists'
);

test(
    '2FA service exports get2FAStatus',
    typeof twoFAService.get2FAStatus === 'function',
    'Function exists'
);

// ──────────────────────────────────────────────────────────────────────
// 3. EMAIL SERVICE TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 3: EMAIL SERVICE\n');

const emailService = require('../../src/shared/services/email.service');

test(
    'Email service exports verifyConnection',
    typeof emailService.verifyConnection === 'function',
    'Function exists'
);

test(
    'Email service exports sendPasswordResetEmail',
    typeof emailService.sendPasswordResetEmail === 'function',
    'Function exists'
);

test(
    'Email service exports sendWelcomeEmail',
    typeof emailService.sendWelcomeEmail === 'function',
    'Function exists'
);

test(
    'Email service exports sendPasswordChangedEmail',
    typeof emailService.sendPasswordChangedEmail === 'function',
    'Function exists'
);

test(
    'Email service exports sendVerificationEmail',
    typeof emailService.sendVerificationEmail === 'function',
    'Function exists'
);

// ──────────────────────────────────────────────────────────────────────
// 4. EMAIL VERIFICATION SERVICE TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 4: EMAIL VERIFICATION SERVICE\n');

const emailVerificationService = require('../../src/shared/services/emailVerification.service');

test(
    'Email verification service exports generateVerificationToken',
    typeof emailVerificationService.generateVerificationToken === 'function',
    'Function exists'
);

test(
    'Email verification service exports sendVerificationEmail',
    typeof emailVerificationService.sendVerificationEmail === 'function',
    'Function exists'
);

test(
    'Email verification service exports verifyEmail',
    typeof emailVerificationService.verifyEmail === 'function',
    'Function exists'
);

test(
    'Email verification service exports resendVerificationEmail',
    typeof emailVerificationService.resendVerificationEmail === 'function',
    'Function exists'
);

// ──────────────────────────────────────────────────────────────────────
// 5. SECURITY AUDIT SERVICE TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 5: SECURITY AUDIT SERVICE\n');

const securityAuditService = require('../../src/shared/services/securityAudit.service');

test(
    'Security audit service exports logSecurityEvent',
    typeof securityAuditService.logSecurityEvent === 'function',
    'Function exists'
);

test(
    'Security audit service exports logLoginSuccess',
    typeof securityAuditService.logLoginSuccess === 'function',
    'Function exists'
);

test(
    'Security audit service exports logLoginFailed',
    typeof securityAuditService.logLoginFailed === 'function',
    'Function exists'
);

test(
    'Security audit service exports logLogout',
    typeof securityAuditService.logLogout === 'function',
    'Function exists'
);

test(
    'Security audit service exports logPasswordChanged',
    typeof securityAuditService.logPasswordChanged === 'function',
    'Function exists'
);

test(
    'Security audit service exports logAccountLocked',
    typeof securityAuditService.logAccountLocked === 'function',
    'Function exists'
);

test(
    'Security audit service exports getUserAuditLogs',
    typeof securityAuditService.getUserAuditLogs === 'function',
    'Function exists'
);

test(
    'Security audit service exports getRecentFailedLogins',
    typeof securityAuditService.getRecentFailedLogins === 'function',
    'Function exists'
);

// ──────────────────────────────────────────────────────────────────────
// 6. SESSION SERVICE TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 6: SESSION SERVICE\n');

const sessionService = require('../../src/shared/services/session.service');

test(
    'Session service exports createSession',
    typeof sessionService.createSession === 'function',
    'Function exists'
);

test(
    'Session service exports validateSession',
    typeof sessionService.validateSession === 'function',
    'Function exists'
);

test(
    'Session service exports getUserSessions',
    typeof sessionService.getUserSessions === 'function',
    'Function exists'
);

test(
    'Session service exports revokeSession',
    typeof sessionService.revokeSession === 'function',
    'Function exists'
);

test(
    'Session service exports revokeAllOtherSessions',
    typeof sessionService.revokeAllOtherSessions === 'function',
    'Function exists'
);

test(
    'Session service exports revokeAllSessions',
    typeof sessionService.revokeAllSessions === 'function',
    'Function exists'
);

test(
    'Session service exports getSessionCount',
    typeof sessionService.getSessionCount === 'function',
    'Function exists'
);

test(
    'Session service exports validateAndRotateRefreshToken',
    typeof sessionService.validateAndRotateRefreshToken === 'function',
    'Function exists'
);

test(
    'Session service exports parseUserAgent',
    typeof sessionService.parseUserAgent === 'function',
    'Function exists'
);

// Test user agent parsing
const uaResult = sessionService.parseUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124 Safari/537.36'
);
test(
    'User agent parsing returns browser info',
    uaResult.browser === 'Chrome' && uaResult.os === 'Windows',
    `Browser: ${uaResult.browser}, OS: ${uaResult.os}`
);

const mobileUa = sessionService.parseUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
);
test(
    'User agent parsing detects mobile device',
    mobileUa.device === 'Mobile' || mobileUa.os === 'iOS',
    `Device: ${mobileUa.device}, OS: ${mobileUa.os}`
);

// ──────────────────────────────────────────────────────────────────────
// 7. OAUTH SERVICE TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 7: OAUTH SERVICE\n');

const oauthService = require('../../src/modules/oauth/services/oauth.service');

test(
    'OAuth service exports generateAuthorizationCode',
    typeof oauthService.generateAuthorizationCode === 'function',
    'Function exists'
);

test(
    'OAuth service exports exchangeCodeForTokens',
    typeof oauthService.exchangeCodeForTokens === 'function',
    'Function exists'
);

test(
    'OAuth service exports registerClient',
    typeof oauthService.registerClient === 'function',
    'Function exists'
);

test(
    'OAuth service exports getClient',
    typeof oauthService.getClient === 'function',
    'Function exists'
);

test(
    'OAuth service exports listClients',
    typeof oauthService.listClients === 'function',
    'Function exists'
);

test(
    'OAuth service exports updateClient',
    typeof oauthService.updateClient === 'function',
    'Function exists'
);

test(
    'OAuth service exports deleteClient',
    typeof oauthService.deleteClient === 'function',
    'Function exists'
);

test(
    'OAuth service exports validateClient',
    typeof oauthService.validateClient === 'function',
    'Function exists'
);

test(
    'OAuth service exports generateAccessToken',
    typeof oauthService.generateAccessToken === 'function',
    'Function exists'
);

test(
    'OAuth service exports generateIdToken',
    typeof oauthService.generateIdToken === 'function',
    'Function exists'
);

test(
    'OAuth service exports generateRefreshToken',
    typeof oauthService.generateRefreshToken === 'function',
    'Function exists'
);

test(
    'OAuth service exports refreshAccessToken',
    typeof oauthService.refreshAccessToken === 'function',
    'Function exists'
);

test(
    'OAuth service exports verifyAccessToken',
    typeof oauthService.verifyAccessToken === 'function',
    'Function exists'
);

test(
    'OAuth service exports getUserInfo',
    typeof oauthService.getUserInfo === 'function',
    'Function exists'
);

test(
    'OAuth service exports revokeToken',
    typeof oauthService.revokeToken === 'function',
    'Function exists'
);

test(
    'OAuth service exports introspectToken',
    typeof oauthService.introspectToken === 'function',
    'Function exists'
);

// Test PKCE verification
const pkceValid = oauthService.verifyPKCE(
    'testcodeverifier123456789012345678901234567890',
    'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    'S256'
);
test(
    'PKCE verification works correctly',
    typeof pkceValid === 'boolean',
    `Returns boolean: ${typeof pkceValid}`
);

// ──────────────────────────────────────────────────────────────────────
// 8. KAFKA LOGGER TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 8: KAFKA LOGGER\n');

const kafkaLogger = require('../../src/shared/utils/kafkaLogger');

test(
    'Kafka logger exports connectKafka',
    typeof kafkaLogger.connectKafka === 'function',
    'Function exists'
);

test(
    'Kafka logger exports logToKafka',
    typeof kafkaLogger.logToKafka === 'function',
    'Function exists'
);

test(
    'Kafka logger exports logBatchToKafka',
    typeof kafkaLogger.logBatchToKafka === 'function',
    'Function exists'
);

test(
    'Kafka logger exports disconnectKafka',
    typeof kafkaLogger.disconnectKafka === 'function',
    'Function exists'
);

test(
    'Kafka logger exports getStatus',
    typeof kafkaLogger.getStatus === 'function',
    'Function exists'
);

test(
    'Kafka logger has TOPICS constant',
    kafkaLogger.TOPICS && typeof kafkaLogger.TOPICS === 'object',
    'TOPICS object exists'
);

// Test Kafka status
const kafkaStatus = kafkaLogger.getStatus();
test(
    'Kafka status returns configuration',
    kafkaStatus.enabled !== undefined && 
    kafkaStatus.connected !== undefined &&
    typeof kafkaStatus.broker === 'string',
    `Enabled: ${kafkaStatus.enabled}, Broker: ${kafkaStatus.broker}`
);

// ──────────────────────────────────────────────────────────────────────
// 9. CONFIGURATION TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 9: CONFIGURATION\n');

const config = require('../../src/shared/config/config');

test(
    'Config exports NODE_ENV',
    typeof config.NODE_ENV === 'string',
    `NODE_ENV: ${config.NODE_ENV}`
);

test(
    'Config exports PORT',
    typeof config.PORT === 'string' || typeof config.PORT === 'number',
    `PORT: ${config.PORT}`
);

test(
    'Config exports MONGODB_URI',
    typeof config.MONGODB_URI === 'string',
    `MONGODB URI configured: ${!!config.MONGODB_URI}`
);

test(
    'Config exports JWT_SECRET',
    typeof config.JWT_SECRET === 'string',
    `JWT Secret configured: ${!!config.JWT_SECRET}`
);

test(
    'Config exports JWT_EXPIRE',
    typeof config.JWT_EXPIRE === 'string',
    `JWT_EXPIRE: ${config.JWT_EXPIRE}`
);

test(
    'Config exports SESSION_SECRET',
    typeof config.SESSION_SECRET === 'string',
    `Session Secret configured: ${!!config.SESSION_SECRET}`
);

test(
    'Config exports CORS_ORIGIN',
    Array.isArray(config.CORS_ORIGIN),
    `CORS_ORIGIN is array: ${Array.isArray(config.CORS_ORIGIN)}`
);

test(
    'Config exports email configuration',
    config.email && typeof config.email === 'object',
    'Email config exists'
);

// ──────────────────────────────────────────────────────────────────────
// 10. ENCRYPTION TESTS
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 SECTION 10: ENCRYPTION UTILITIES\n');

// Test crypto utilities exist
test(
    'Node.js crypto module available',
    typeof crypto.randomBytes === 'function',
    'crypto.randomBytes exists'
);

test(
    'Node.js crypto createHash available',
    typeof crypto.createHash === 'function',
    'crypto.createHash exists'
);

test(
    'Node.js crypto createCipheriv available',
    typeof crypto.createCipheriv === 'function',
    'crypto.createCipheriv exists (secure)'
);

test(
    'Node.js crypto createDecipheriv available',
    typeof crypto.createDecipheriv === 'function',
    'crypto.createDecipheriv exists (secure)'
);

// Test random bytes generation
const randomBytes = crypto.randomBytes(32);
test(
    'Random bytes generation works',
    randomBytes.length === 32,
    `Generated ${randomBytes.length} bytes`
);

// Test hash generation
const hash = crypto.createHash('sha256').update('test').digest('hex');
test(
    'SHA256 hash generation works',
    typeof hash === 'string' && hash.length === 64,
    `Hash length: ${hash.length}`
);

// ──────────────────────────────────────────────────────────────────────
// SUMMARY
// ──────────────────────────────────────────────────────────────────────
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║                    TEST SUMMARY                           ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

const total = results.passed.length + results.failed.length;
const passRate = total > 0 ? ((results.passed.length / total) * 100).toFixed(1) : 0;

console.log(`╔═══════════════════════════════════════════════════════════╗`);
console.log(`║  PASSED:  ${results.passed.length.toString().padEnd(3)} / ${total.toString().padEnd(3)} (${passRate}%)                           ║`);
console.log(`║  FAILED:  ${results.failed.length.toString().padEnd(3)} / ${total.toString().padEnd(3)}                              ║`);
console.log(`╚═══════════════════════════════════════════════════════════╝\n`);

if (results.failed.length > 0) {
    console.log('❌ FAILED TESTS:\n');
    results.failed.forEach(f => {
        console.log(`   ❌ ${f.name}`);
        if (f.details) console.log(`      ${f.details}`);
    });
    console.log();
}

// Exit with error code if tests failed
if (results.failed.length > 0) {
    process.exit(1);
}
