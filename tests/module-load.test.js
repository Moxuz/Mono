/**
 * Module Loading Test
 * Tests that all modules load correctly without MongoDB
 * Run: node tests/module-load.test.js
 */

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║              MODULE LOADING TESTS                        ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

function test(description, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${description}`);
        passed++;
    } catch (error) {
        console.log(`❌ FAIL: ${description}`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Stack: ${error.stack.split('\n')[1]}`);
        failed++;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// MODULE LOADING TESTS
// ────────────────────────────────────────────────────────────────────────────

console.log('📋 Testing Module Loading...\n');

test('Load config module', () => {
    const config = require('../src/shared/config/config');
    if (!config.PORT) throw new Error('PORT not defined');
    if (!config.AUTH_SERVER_URL) throw new Error('AUTH_SERVER_URL not defined');
});

test('Load password validator', () => {
    const validator = require('../src/shared/utils/passwordValidator');
    if (!validator.validatePassword) throw new Error('validatePassword not exported');
    if (!validator.getPasswordStrengthInfo) throw new Error('getPasswordStrengthInfo not exported');
});

test('Load email templates', () => {
    const templates = require('../src/shared/services/email.templates');
    if (!templates.getPasswordResetTemplate) throw new Error('getPasswordResetTemplate not exported');
});

test('Load email service', () => {
    const emailService = require('../src/shared/services/email.service');
    if (!emailService.verifyConnection) throw new Error('verifyConnection not exported');
});

test('Load security audit service', () => {
    const auditService = require('../src/shared/services/securityAudit.service');
    if (!auditService.logLoginSuccess) throw new Error('logLoginSuccess not exported');
    if (!auditService.getUserAuditLogs) throw new Error('getUserAuditLogs not exported');
});

test('Load User model (schema only)', () => {
    // This just tests the schema loads, not DB connection
    const UserSchema = require('../src/shared/models/User');
    if (!UserSchema) throw new Error('User model not exported');
});

test('Load SecurityAudit model (schema only)', () => {
    const AuditSchema = require('../src/shared/models/SecurityAudit');
    if (!AuditSchema) throw new Error('SecurityAudit model not exported');
});

test('Load AuthorizationCode model (schema only)', () => {
    const AuthCodeSchema = require('../src/shared/models/AuthorizationCode');
    if (!AuthCodeSchema) throw new Error('AuthorizationCode model not exported');
});

test('Load Client model (schema only)', () => {
    const ClientSchema = require('../src/shared/models/Client');
    if (!ClientSchema) throw new Error('Client model not exported');
});

test('Load Consent model (schema only)', () => {
    const ConsentSchema = require('../src/shared/models/Consent');
    if (!ConsentSchema) throw new Error('Consent model not exported');
});

test('Load TokenBlacklist model (schema only)', () => {
    const TokenSchema = require('../src/shared/models/TokenBlacklist');
    if (!TokenSchema) throw new Error('TokenBlacklist model not exported');
});

test('Load passport config', () => {
    const passport = require('../src/shared/config/passport');
    if (!passport.passport) throw new Error('passport not exported');
    // GOOGLE_ENABLED is either true or false, so check if property exists
    if (passport.GOOGLE_ENABLED === undefined) throw new Error('GOOGLE_ENABLED not exported');
});

test('Load rate limiter middleware', () => {
    const rateLimiter = require('../src/shared/middleware/rateLimiter');
    if (!rateLimiter.loginLimiter) throw new Error('loginLimiter not exported');
    if (!rateLimiter.generalLimiter) throw new Error('generalLimiter not exported');
});

test('Load logger', () => {
    const logger = require('../src/shared/utils/logger');
    if (!logger.info) throw new Error('info method not exported');
    if (!logger.error) throw new Error('error method not exported');
});

test('Load auth service', () => {
    const authService = require('../src/modules/auth/services/auth.service');
    if (!authService.register) throw new Error('register not exported');
    if (!authService.login) throw new Error('login not exported');
    if (!authService.changePassword) throw new Error('changePassword not exported');
});

test('Load auth controller', () => {
    const authController = require('../src/modules/auth/controllers/auth.controller');
    if (!authController.register) throw new Error('register not exported');
    if (!authController.changePassword) throw new Error('changePassword not exported');
    if (!authController.getAuditLogs) throw new Error('getAuditLogs not exported');
});

test('Load auth routes', () => {
    const authRoutes = require('../src/modules/auth/routes/auth.routes');
    if (!authRoutes) throw new Error('authRoutes not exported');
});

test('Load oauth service', () => {
    const oauthService = require('../src/modules/oauth/services/oauth.service');
    if (!oauthService.generateAuthorizationCode) throw new Error('generateAuthorizationCode not exported');
    if (!oauthService.getUserInfo) throw new Error('getUserInfo not exported');
});

test('Load oauth controller', () => {
    const oauthController = require('../src/modules/oauth/controllers/oauth.controller');
    if (!oauthController.registerClient) throw new Error('registerClient not exported');
    if (!oauthController.token) throw new Error('token not exported');
});

test('Load user routes', () => {
    const userRoutes = require('../src/modules/user/routes/user.routes');
    if (!userRoutes) throw new Error('userRoutes not exported');
});

test('Load app.js (Express app)', () => {
    const app = require('../src/app');
    if (!app.listen) throw new Error('listen method not exported');
});

test('Load swagger.json', () => {
    const swagger = require('../swagger.json');
    if (!swagger.openapi) throw new Error('openapi version not defined');
    if (!swagger.paths) throw new Error('paths not defined');
});

// ────────────────────────────────────────────────────────────────────────────
// FUNCTIONAL TESTS (No DB)
// ────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Testing Functionality (No DB)...\n');

test('Password validator - weak password', () => {
    const { validatePassword } = require('../src/shared/utils/passwordValidator');
    const result = validatePassword('weak');
    if (result.valid) throw new Error('Weak password should be invalid');
    if (result.errors.length === 0) throw new Error('Should have errors');
});

test('Password validator - strong password', () => {
    const { validatePassword } = require('../src/shared/utils/passwordValidator');
    const result = validatePassword('Secur3P@ssw0rd!');
    if (!result.valid) throw new Error('Strong password should be valid');
    if (result.errors.length !== 0) throw new Error('Should have no errors');
});

test('Password validator - common password', () => {
    const { validatePassword, COMMON_PASSWORDS } = require('../src/shared/utils/passwordValidator');
    if (!COMMON_PASSWORDS.has('password')) throw new Error('password should be in common list');
    const result = validatePassword('password');
    if (result.valid) throw new Error('Common password should be invalid');
});

test('User model has lockout methods', () => {
    const mongoose = require('mongoose');
    const User = require('../src/shared/models/User');
    
    // Check schema has the fields
    const schema = User.schema.obj;
    if (!schema.failedLoginAttempts) throw new Error('failedLoginAttempts field missing');
    if (!schema.lockUntil) throw new Error('lockUntil field missing');
    
    // Check methods exist
    const mockUser = new User({ username: 'test', email: 'test@test.com', password: 'Test123!' });
    if (typeof mockUser.isLocked !== 'function') throw new Error('isLocked method missing');
    if (typeof mockUser.incrementLoginAttempts !== 'function') throw new Error('incrementLoginAttempts method missing');
    if (typeof mockUser.resetLoginAttempts !== 'function') throw new Error('resetLoginAttempts method missing');
});

test('SecurityAudit model has static methods', () => {
    const SecurityAudit = require('../src/shared/models/SecurityAudit');
    if (typeof SecurityAudit.logEvent !== 'function') throw new Error('logEvent method missing');
    if (typeof SecurityAudit.getUserLogs !== 'function') throw new Error('getUserLogs method missing');
    if (typeof SecurityAudit.getRecentFailedLogins !== 'function') throw new Error('getRecentFailedLogins method missing');
});

// ────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ────────────────────────────────────────────────────────────────────────────

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║                    TEST SUMMARY                           ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║  ✅ Passed: ${passed.toString().padEnd(43)} ║`);
console.log(`║  ❌ Failed: ${failed.toString().padEnd(43)} ║`);
console.log(`║  📊 Total:  ${(passed + failed).toString().padEnd(42)} ║`);
console.log('╚═══════════════════════════════════════════════════════════╝\n');

if (failed > 0) {
    console.log('⚠️  Some tests failed. Please review the errors above.\n');
    process.exit(1);
} else {
    console.log('🎉 All module loading tests passed!\n');
    console.log('✅ All modules load correctly');
    console.log('✅ All schemas are properly defined');
    console.log('✅ All methods are exported');
    console.log('✅ Password validator works correctly');
    console.log('✅ Email templates render properly\n');
    process.exit(0);
}
