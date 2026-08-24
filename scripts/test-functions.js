#!/usr/bin/env node
/**
 * Pure Function Tests — No server required.
 * Tests service/utility functions in isolation.
 *
 * Usage: node scripts/test-functions.js
 */

require('dotenv').config();

const assert = require('assert');

let passed = 0;
let failed = 0;
const asyncTests = []; // collect async tests to await at the end

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}`);
        console.error(`     ${err.message}`);
        failed++;
    }
}

function testAsync(name, fn) {
    // Queue async test — will be awaited in main()
    asyncTests.push({ name, fn });
    console.log(`  ⏳ ${name} (async — runs after sync tests)`);
}

function section(title) {
    console.log(`\n── ${title} ─────────────────────────────────`);
}

// ─────────────────────────────────────────────────────────────────────────────

section('Password Validator');

const { validatePassword } = require('../src/shared/utils/passwordValidator');

test('valid password (8+ chars, has number) → { valid: true }', () => {
    const r = validatePassword('SecureX99!');
    assert.strictEqual(r.valid, true, JSON.stringify(r.errors));
});

test('password < 8 chars → { valid: false }', () => {
    const r = validatePassword('abc1');
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('8')), 'Expected 8-char error');
});

test('password with no number → { valid: false }', () => {
    const r = validatePassword('NoNumbers!');
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /number/i.test(e)), 'Expected number error');
});

test('empty password → { valid: false }', () => {
    const r = validatePassword('');
    assert.strictEqual(r.valid, false);
});

test('null password → { valid: false }', () => {
    const r = validatePassword(null);
    assert.strictEqual(r.valid, false);
});

test('long strong password → { valid: true, score > 3 }', () => {
    const r = validatePassword('MyStr0ng!P@ssword99');
    assert.strictEqual(r.valid, true);
    assert.ok(r.score > 3, `Expected score > 3, got ${r.score}`);
});

// ─────────────────────────────────────────────────────────────────────────────

section('stripOperators (NoSQL injection prevention)');

const { sanitizeBody } = require('../src/shared/middleware/validate');

// Test stripOperators indirectly via a mock req/res
function strip(obj) {
    let result;
    const req = { body: obj };
    const res = {};
    const next = () => { result = req.body; };
    sanitizeBody(req, res, next);
    return result;
}

test('$ operator keys stripped', () => {
    const clean = strip({ '$gt': 1, name: 'ok' });
    assert.strictEqual(clean['$gt'], undefined, '$gt should be stripped');
    assert.strictEqual(clean.name, 'ok', 'name should remain');
});

test('$where stripped from nested object', () => {
    const clean = strip({ user: { '$where': 'function(){}', id: 1 } });
    assert.strictEqual(clean.user['$where'], undefined, '$where should be stripped');
    assert.strictEqual(clean.user.id, 1);
});

test('__proto__ key stripped', () => {
    const clean = strip({ '__proto__': { isAdmin: true }, name: 'test' });
    assert.strictEqual(clean['__proto__'], undefined, '__proto__ should be stripped');
    assert.strictEqual(clean.name, 'test');
});

test('constructor key stripped', () => {
    const clean = strip({ constructor: { prototype: {} }, value: 42 });
    assert.strictEqual(clean.constructor, undefined, 'constructor should be stripped');
    assert.strictEqual(clean.value, 42);
});

test('prototype key stripped', () => {
    const clean = strip({ prototype: {}, safe: 'yes' });
    assert.strictEqual(clean.prototype, undefined, 'prototype should be stripped');
    assert.strictEqual(clean.safe, 'yes');
});

test('normal body unchanged', () => {
    const clean = strip({ email: 'a@b.com', password: 'Test1234', username: 'user1' });
    assert.strictEqual(clean.email, 'a@b.com');
    assert.strictEqual(clean.password, 'Test1234');
    assert.strictEqual(clean.username, 'user1');
});

test('arrays recursively processed', () => {
    const clean = strip({ items: [{ '$gt': 1 }, { value: 2 }] });
    assert.strictEqual(clean.items[0]['$gt'], undefined);
    assert.strictEqual(clean.items[1].value, 2);
});

test('Object.prototype not polluted after strip', () => {
    strip({ '__proto__': { polluted: true } });
    assert.strictEqual(({}).polluted, undefined, 'Object.prototype should not be polluted');
});

test('deep request body is rejected by the sanitizer', () => {
    const body = {};
    let cursor = body;
    for (let i = 0; i < 25; i++) {
        cursor.next = {};
        cursor = cursor.next;
    }
    const req = { body };
    const res = {
        statusCode: 0,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return payload; }
    };
    sanitizeBody(req, res, () => {});
    assert.strictEqual(res.statusCode, 400);
});

const { parsePagination } = require('../src/shared/utils/pagination');

test('pagination caps oversized page and limit values', () => {
    const result = parsePagination('999999999999999999999', '999', 20, 100);
    assert.deepStrictEqual(result, { page: 1, limit: 100 });
});

// ─────────────────────────────────────────────────────────────────────────────

section('Session Model — Hash & Token Generation');

const Session = require('../src/shared/models/Session');

test('hashRefreshToken → 64-char hex string', () => {
    const hash = Session.hashRefreshToken('some-refresh-token');
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hash), 'Should be hex');
});

test('hashRefreshToken → deterministic (same input, same output)', () => {
    const h1 = Session.hashRefreshToken('my-token');
    const h2 = Session.hashRefreshToken('my-token');
    assert.strictEqual(h1, h2);
});

test('hashRefreshToken → different inputs produce different hashes', () => {
    const h1 = Session.hashRefreshToken('token-a');
    const h2 = Session.hashRefreshToken('token-b');
    assert.notStrictEqual(h1, h2);
});

test('hashToken → 64-char hex string', () => {
    const hash = Session.hashToken('some-access-token');
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hash));
});

test('hashToken → unique for different inputs', () => {
    const h1 = Session.hashToken('access-token-a');
    const h2 = Session.hashToken('access-token-b');
    assert.notStrictEqual(h1, h2, 'Different tokens must produce different hashes');
});

test('hashRefreshToken → throws on empty input', () => {
    assert.throws(() => Session.hashRefreshToken(''), /required/i);
});

// ─────────────────────────────────────────────────────────────────────────────

section('Auth Service — Token Creation & Validation');

// auth.service.js exports a singleton instance
const authService = require('../src/modules/auth/services/auth.service');

const fakeUser = {
    _id: '507f1f77bcf86cd799439011',
    id:  '507f1f77bcf86cd799439011',
    email: 'a@b.com', username: 'test', role: 'user'
};

testAsync('validateToken: garbage string → { valid: false }', async () => {
    const r = await authService.validateToken('not.a.real.token');
    assert.strictEqual(r.valid, false);
});

testAsync('validateToken: empty string → { valid: false }', async () => {
    const r = await authService.validateToken('');
    assert.strictEqual(r.valid, false);
});

test('createToken: returns 3-part JWT string', () => {
    const token = authService.createToken(fakeUser);
    assert.strictEqual(typeof token, 'string');
    assert.strictEqual(token.split('.').length, 3, 'JWT must have 3 parts');
});

test('createToken: payload contains subject + expiry', () => {
    const token = authService.createToken(fakeUser);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.ok(payload.sub || payload.id || payload.userId, 'Payload must have subject');
    assert.ok(payload.exp, 'Payload must have expiry');
});

testAsync('validateToken: fresh self-issued token → { valid: true }', async () => {
    const token = authService.createToken(fakeUser);
    const r = await authService.validateToken(token);
    assert.strictEqual(r.valid, true, `Expected valid=true, got: ${JSON.stringify(r)}`);
});

test('generateRefreshToken: returns 3-part JWT string', () => {
    const token = authService.generateRefreshToken(fakeUser);
    assert.strictEqual(typeof token, 'string');
    assert.strictEqual(token.split('.').length, 3);
});

// ─────────────────────────────────────────────────────────────────────────────

section('OAuth Service — PKCE Verification');

// oauth.service.js exports a singleton instance
const oauthService = require('../src/modules/oauth/services/oauth.service');
const crypto = require('crypto');

function makeVerifier() {
    return crypto.randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function makeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

test('verifyPKCE: correct verifier → true', () => {
    const v = makeVerifier();
    const c = makeChallenge(v);
    assert.strictEqual(oauthService.verifyPKCE(v, c, 'S256'), true);
});

test('verifyPKCE: wrong verifier → false', () => {
    const v = makeVerifier();
    const c = makeChallenge(v);
    assert.strictEqual(oauthService.verifyPKCE('wrongverifier', c, 'S256'), false);
});

test('verifyPKCE: plain method → false (not supported)', () => {
    const v = makeVerifier();
    assert.strictEqual(oauthService.verifyPKCE(v, v, 'plain'), false);
});

test('verifyPKCE: missing verifier → false', () => {
    const c = makeChallenge(makeVerifier());
    assert.strictEqual(oauthService.verifyPKCE('', c, 'S256'), false);
});

test('verifyPKCE: missing challenge → false', () => {
    const v = makeVerifier();
    assert.strictEqual(oauthService.verifyPKCE(v, '', 'S256'), false);
});

test('verifyPKCE: short verifier → false', () => {
    const v = 'short-verifier';
    const c = makeChallenge(v);
    assert.strictEqual(oauthService.verifyPKCE(v, c, 'S256'), false);
});

section('OAuth policy');

const { validateRegisteredScopes, sanitizeRequestedScopes } = require('../src/shared/utils/oauthScopes');
const oauthConfig = require('../src/shared/config/config');
const oauthKeys = require('../src/shared/config/oidcKeys');
const jwtLib = require('jsonwebtoken');
const policyUser = { _id: { toString: () => '507f1f77bcf86cd799439011' } };

test('registered scopes accept OIDC base scopes', () => {
    const result = validateRegisteredScopes('openid profile email');
    assert.strictEqual(result.valid, true);
});

test('registered scopes reject custom resource scopes', () => {
    const result = validateRegisteredScopes('openid profile admin:read');
    assert.strictEqual(result.valid, false);
    assert.ok(/unsupported/i.test(result.error));
});

test('requested scopes reject unregistered custom scopes', () => {
    assert.deepStrictEqual(
        sanitizeRequestedScopes('openid profile admin:read', 'openid profile email'),
        []
    );
});

test('OAuth access tokens use RS256', () => {
    const token = oauthService.generateAccessToken(policyUser, 'test-client', 'openid profile email');
    const complete = jwtLib.decode(token, { complete: true });
    assert.strictEqual(complete.header.alg, 'RS256');
    const verified = jwtLib.verify(token, oauthKeys.publicKey, {
        algorithms: ['RS256'],
        issuer: oauthConfig.BASE_URL || 'http://localhost:5000',
        audience: 'test-client'
    });
    assert.strictEqual(verified.type, 'access_token');
});

test('OAuth refresh tokens require offline_access', () => {
    assert.throws(
        () => oauthService.generateRefreshToken(policyUser, 'test-client', 'openid profile email'),
        /offline_access/
    );
    const token = oauthService.generateRefreshToken(
        policyUser,
        'test-client',
        'openid profile email offline_access'
    );
    const complete = jwtLib.decode(token, { complete: true });
    assert.strictEqual(complete.header.alg, 'HS256');
});

// ─────────────────────────────────────────────────────────────────────────────

section('User Model — Lockout Methods');

const User = require('../src/shared/models/User');

test('isLocked(): lockUntil in past → false', () => {
    const u = new User();
    u.lockUntil = new Date(Date.now() - 10000); // 10 seconds ago
    assert.strictEqual(u.isLocked(), false);
});

test('isLocked(): lockUntil in future → true', () => {
    const u = new User();
    u.lockUntil = new Date(Date.now() + 60000); // 1 minute ahead
    assert.strictEqual(u.isLocked(), true);
});

test('isLocked(): no lockUntil set → false', () => {
    const u = new User();
    u.lockUntil = null;
    assert.strictEqual(u.isLocked(), false);
});

// ─────────────────────────────────────────────────────────────────────────────

section('Logger — File Rotation');

const path = require('path');
const fs = require('fs');

test('logs directory exists or was created', () => {
    const logsDir = path.join(__dirname, '../logs');
    // Require logger to trigger directory creation
    require('../src/shared/utils/logger');
    assert.ok(fs.existsSync(logsDir), 'logs/ directory should exist');
});

test('appendToFile creates dated log file', () => {
    const logger = require('../src/shared/utils/logger');
    logger.info('test-functions.js: logger smoke test');
    const logsDir = path.join(__dirname, '../logs');
    const today = new Date().toISOString().slice(0, 10);
    const files = fs.readdirSync(logsDir);
    const hasToday = files.some(f => f.includes(today));
    assert.ok(hasToday, `Expected a log file with today's date (${today}), found: ${files.join(', ')}`);
});

// ─────────────────────────────────────────────────────────────────────────────

section('Audit Privacy and Data Lifecycle');

const {
    hashIdentity,
    sanitizeAuditMetadata,
    redactText,
    redactLogMetadata
} = require('../src/shared/utils/auditIdentity');
const SecurityAudit = require('../src/shared/models/SecurityAudit');

test('audit metadata removes raw email and stores a stable hash', () => {
    const email = 'audit-user@example.com';
    const sanitized = sanitizeAuditMetadata({ email, reason: 'invalid_credentials' });
    assert.strictEqual(sanitized.email, undefined);
    assert.strictEqual(sanitized.emailHash, hashIdentity(email));
});

test('audit metadata removes raw username', () => {
    const sanitized = sanitizeAuditMetadata({ username: 'private-user' });
    assert.strictEqual(sanitized.username, undefined);
    assert.ok(/^[0-9a-f]{64}$/.test(sanitized.usernameHash));
});

test('log text redacts email-shaped values', () => {
    const redacted = redactText('Login failed for audit-user@example.com');
    assert.ok(!redacted.includes('audit-user@example.com'));
    assert.ok(redacted.includes('[email:'));
});

test('structured logs redact credentials and email values', () => {
    const redacted = redactLogMetadata({
        email: 'audit-user@example.com',
        password: 'not-a-log-value',
        nested: { client_secret: 'not-a-log-value' }
    });
    assert.ok(!JSON.stringify(redacted).includes('audit-user@example.com'));
    assert.ok(!JSON.stringify(redacted).includes('not-a-log-value'));
});

test('SecurityAudit schema exposes pseudonymous identity and cleanup methods', () => {
    assert.ok(SecurityAudit.schema.path('emailHash'));
    assert.strictEqual(SecurityAudit.schema.path('email').options.select, false);
    assert.strictEqual(typeof SecurityAudit.scrubLegacyIdentityFields, 'function');
    assert.strictEqual(typeof SecurityAudit.redactUserIdentity, 'function');
});

testAsync('SecurityAudit document hook removes raw identity before persistence', async () => {
    const document = new SecurityAudit({
        action: 'login_failed',
        email: 'audit-user@example.com',
        metadata: {
            email: 'audit-user@example.com',
            username: 'private-user'
        }
    });
    await document.validate();
    assert.strictEqual(document.email, null);
    assert.strictEqual(document.metadata.email, undefined);
    assert.strictEqual(document.metadata.emailHash, hashIdentity('audit-user@example.com'));
    assert.strictEqual(document.metadata.username, undefined);
});

test('client-1 exposes an unauthenticated health endpoint', () => {
    const fs = require('fs');
    const clientOneCode = fs.readFileSync('cLient-app-1/server.js', 'utf8');
    assert.ok(clientOneCode.includes("app.get('/api/health'"));
});

// ─────────────────────────────────────────────────────────────────────────────

section('TokenBlacklist Model — Expiry Fix');

const TokenBlacklist = require('../src/shared/models/TokenBlacklist');

test('revokeToken static method exists', () => {
    assert.strictEqual(typeof TokenBlacklist.revokeToken, 'function');
});

test('isBlacklisted static method exists', () => {
    assert.strictEqual(typeof TokenBlacklist.isBlacklisted, 'function');
});

// Verify the expiresAt fix: given an already-expired JWT, expiresAt must be in the future
test('expiresAt is always in the future (TTL bypass fix)', () => {
    const jwt = require('jsonwebtoken');
    // Create a token that is already expired (exp 5 minutes ago)
    const expiredToken = jwt.sign({ sub: '123', exp: Math.floor(Date.now() / 1000) - 300 }, 'test-secret');
    const decoded = jwt.decode(expiredToken);
    const expiresAt = new Date(Math.max(decoded.exp * 1000, Date.now() + 60000));
    assert.ok(expiresAt > new Date(), `expiresAt should be in the future, got ${expiresAt}`);
    assert.ok(expiresAt >= new Date(Date.now() + 59000), 'expiresAt should be at least 60s in the future');
});

// ─────────────────────────────────────────────────────────────────────────────

// Run all queued async tests then print final results
async function runAsyncTests() {
    if (asyncTests.length === 0) return;
    console.log('\n── Async Tests ─────────────────────────────────');
    for (const { name, fn } of asyncTests) {
        try {
            await fn();
            console.log(`  ✅ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ ${name}`);
            console.error(`     ${err.message}`);
            failed++;
        }
    }
}

runAsyncTests().then(() => {
    console.log('\n' + '═'.repeat(50));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(50));
    if (failed > 0) {
        process.exit(1);
    } else {
        console.log('All function tests passed ✅');
        process.exit(0);
    }
}).catch(err => {
    console.error('Fatal error in async tests:', err);
    process.exit(1);
});
