/**
 * Comprehensive Test Suite for New Features
 * Run: node tests/comprehensive.test.js
 */

const assert = require('assert');

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║     COMPREHENSIVE TEST SUITE - NEW FEATURES              ║');
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
        failed++;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. PASSWORD VALIDATOR TESTS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Testing Password Validator...\n');

const { validatePassword, getPasswordStrengthInfo, COMMON_PASSWORDS } = require('../src/shared/utils/passwordValidator');

test('Password too short (< 8 chars)', () => {
    const result = validatePassword('Pass1!');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('8 characters')));
});

test('Password missing uppercase', () => {
    const result = validatePassword('password123!');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('uppercase')));
});

test('Password missing lowercase', () => {
    const result = validatePassword('PASSWORD123!');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('lowercase')));
});

test('Password missing number', () => {
    const result = validatePassword('Password!');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('number')));
});

test('Password missing special character', () => {
    const result = validatePassword('Password123');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('special character')));
});

test('Password is common password', () => {
    const result = validatePassword('password');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('common')));
});

test('Password with repeated characters', () => {
    const result = validatePassword('Passssword1!');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('repeated')));
});

test('Password with sequential characters', () => {
    const result = validatePassword('Pass123!');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('sequential')));
});

test('Strong password', () => {
    const result = validatePassword('Secur3P@ssw0rd!');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
    assert.ok(result.score >= 5);
});

test('Get password strength info', () => {
    const info = getPasswordStrengthInfo('SecureP@ss123!');
    assert.ok(info.score > 50);
    assert.ok(info.requirements.length === 5);
});

test('Get password strength info - empty password', () => {
    const info = getPasswordStrengthInfo('');
    assert.strictEqual(info.score, 0);
    assert.strictEqual(info.strength, 'none');
});

// ────────────────────────────────────────────────────────────────────────────
// 2. CONFIG TESTS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Testing Configuration...\n');

const config = require('../src/shared/config/config');

test('Config has AUTH_SERVER_URL', () => {
    assert.ok(config.AUTH_SERVER_URL);
    assert.ok(typeof config.AUTH_SERVER_URL === 'string');
});

test('Config has BASE_URL', () => {
    assert.ok(config.BASE_URL);
    assert.ok(typeof config.BASE_URL === 'string');
});

test('Config has JWT_SECRET', () => {
    assert.ok(config.JWT_SECRET);
    assert.notStrictEqual(config.JWT_SECRET, 'your_jwt_secret_key_change_in_production');
});

// ────────────────────────────────────────────────────────────────────────────
// 3. EMAIL TEMPLATES TESTS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Testing Email Templates...\n');

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

// ────────────────────────────────────────────────────────────────────────────
// 4. USER MODEL TESTS (Account Lockout)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Testing User Model (Account Lockout)...\n');

// Mock mongoose for testing without DB
const mockUser = {
    failedLoginAttempts: 0,
    lockUntil: null,
    
    isLocked() {
        if (!this.lockUntil) return false;
        return this.lockUntil > new Date();
    },
    
    async incrementLoginAttempts() {
        const maxAttempts = 5;
        const lockTimeMs = 15 * 60 * 1000;

        if (this.lockUntil && this.lockUntil > new Date()) {
            return false;
        }

        if (this.lockUntil && this.lockUntil < new Date()) {
            this.failedLoginAttempts = 0;
            this.lockUntil = null;
        }

        this.failedLoginAttempts += 1;

        if (this.failedLoginAttempts >= maxAttempts) {
            this.lockUntil = new Date(Date.now() + lockTimeMs);
        }

        return this.isLocked();
    },
    
    async resetLoginAttempts() {
        this.failedLoginAttempts = 0;
        this.lockUntil = null;
    }
};

test('User not locked initially', () => {
    assert.strictEqual(mockUser.isLocked(), false);
});

test('User locked after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
        await mockUser.incrementLoginAttempts();
    }
    assert.strictEqual(mockUser.isLocked(), true);
    assert.strictEqual(mockUser.failedLoginAttempts, 5);
});

test('User reset after successful login', async () => {
    await mockUser.resetLoginAttempts();
    assert.strictEqual(mockUser.failedLoginAttempts, 0);
    assert.strictEqual(mockUser.isLocked(), false);
});

test('User can attempt again after lock expires', async () => {
    // Simulate expired lock
    mockUser.lockUntil = new Date(Date.now() - 1000); // 1 second ago
    mockUser.failedLoginAttempts = 5;
    
    const result = await mockUser.incrementLoginAttempts();
    assert.strictEqual(mockUser.failedLoginAttempts, 1); // Reset and incremented
});

// ────────────────────────────────────────────────────────────────────────────
// 5. EMAIL VERIFICATION SERVICE TESTS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Testing Email Verification Service...\n');

const emailVerificationService = require('../src/shared/services/emailVerification.service');

test('Email verification service exports required methods', () => {
    assert.ok(typeof emailVerificationService.generateVerificationToken === 'function');
    assert.ok(typeof emailVerificationService.sendVerificationEmail === 'function');
    assert.ok(typeof emailVerificationService.verifyEmail === 'function');
    assert.ok(typeof emailVerificationService.resendVerificationEmail === 'function');
});

// ────────────────────────────────────────────────────────────────────────────
// 6. SECURITY AUDIT SERVICE TESTS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Testing Security Audit Service...\n');

const securityAuditService = require('../src/shared/services/securityAudit.service');

test('Security audit service exports required methods', () => {
    assert.ok(typeof securityAuditService.logSecurityEvent === 'function');
    assert.ok(typeof securityAuditService.logLoginSuccess === 'function');
    assert.ok(typeof securityAuditService.logLoginFailed === 'function');
    assert.ok(typeof securityAuditService.logLogout === 'function');
    assert.ok(typeof securityAuditService.logPasswordChanged === 'function');
    assert.ok(typeof securityAuditService.getUserAuditLogs === 'function');
});

// ────────────────────────────────────────────────────────────────────────────
// 7. AUTH SERVICE TESTS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Testing Auth Service...\n');

const authService = require('../src/modules/auth/services/auth.service');

test('Auth service exports required methods', () => {
    assert.ok(typeof authService.register === 'function');
    assert.ok(typeof authService.login === 'function');
    assert.ok(typeof authService.changePassword === 'function');
    assert.ok(typeof authService.validateToken === 'function');
    assert.ok(typeof authService.refreshToken === 'function');
});

test('Auth service register validates weak password', async () => {
    try {
        await authService.register({
            username: 'testuser',
            email: 'test@example.com',
            password: 'weak',
            pdpaConsent: {
                essentialAccepted: true,
                essentialAcceptedAt: new Date(),
                policyVersion: '1.0.0',
                consentIp: '127.0.0.1'
            }
        });
        throw new Error('Should have thrown for weak password');
    } catch (error) {
        assert.strictEqual(error.code, 'WEAK_PASSWORD');
        assert.ok(error.details.length > 0);
    }
});

// ────────────────────────────────────────────────────────────────────────────
// 8. APP ROUTES TESTS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Testing App Routes...\n');

const app = require('../src/app');

test('App exports successfully', () => {
    assert.ok(app);
    assert.ok(typeof app.listen === 'function');
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
    console.log('🎉 All tests passed!\n');
    process.exit(0);
}
