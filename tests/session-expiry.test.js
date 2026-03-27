/**
 * Session Expiry & Lifecycle Integration Test
 *
 * Tests:
 *  1. Valid session — authenticated requests work
 *  2. Expired JWT — rejected with 401
 *  3. Session revocation — revoked session blocks session-required endpoints
 *  4. Refresh token — issues new JWT after old one expires
 *  5. Revoke all sessions — all sessions cleared
 *  6. Revoke all others — only current session survives
 *  7. Session activity — lastActiveAt updates on requests
 *  8. Session listing — correct count and fields
 *
 * Run: node tests/session-expiry.test.js
 */
'use strict';

const http = require('http');
const jwt  = require('jsonwebtoken');
const path = require('path');

// Load .env for local runs (Docker injects env vars automatically)
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}

const BASE_URL   = process.env.TEST_BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET    || 'your_secret_key_123456';

// ─── Helpers ────────────────────────────────────────────────────────────────

const results = { passed: [], failed: [], total: 0 };

function test(name, condition, details = '') {
    results.total++;
    if (condition) {
        results.passed.push(name);
        console.log(`  ✅ ${name}${details ? ' — ' + details : ''}`);
    } else {
        results.failed.push(name);
        console.log(`  ❌ ${name}${details ? ' — ' + details : ''}`);
    }
}

function request(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url     = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port:     url.port || 5000,
            path:     url.pathname + url.search,
            method,
            headers:  { 'Content-Type': 'application/json', ...headers }
        };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try   { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
                catch { resolve({ status: res.statusCode, data: body }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

function auth(token) { return { Authorization: `Bearer ${token}` }; }
function sleep(ms)   { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
    const ts       = Date.now();
    const email    = `sesstest_${ts}@example.com`;
    const username = `sesstest${ts}`.slice(0, 20);
    const password = 'TestPass123!';

    // Register once — shared user for all sections
    const regRes = await request('POST', '/api/auth/register', {
        username, email, password, consentEssential: true
    });
    if (regRes.status !== 201) {
        console.error('❌ Could not register test user — aborting.', regRes.data);
        process.exit(1);
    }

    // ── 1. Valid Session ─────────────────────────────────────────────────────
    console.log('\n🔐 1. Valid Session');

    const loginRes = await request('POST', '/api/auth/login', { email, password });
    const token     = loginRes.data?.data?.token;
    const sessionId = loginRes.data?.data?.sessionId;
    const refreshTk = loginRes.data?.data?.refreshToken;

    test('Login returns HTTP 200',          loginRes.status === 200);
    test('Login returns access token',      !!token,     token     ? 'present' : 'missing');
    test('Login returns sessionId',         !!sessionId, sessionId ? sessionId : 'missing');
    test('Login returns refreshToken',      !!refreshTk, refreshTk ? 'present' : 'missing');

    const profileRes = await request('GET', '/api/auth/profile', null, auth(token));
    test('Authenticated GET /profile returns 200', profileRes.status === 200,
        `HTTP ${profileRes.status}`);
    test('Profile response contains email', profileRes.data?.data?.email === email);

    // ── 2. Expired JWT ───────────────────────────────────────────────────────
    console.log('\n⏰ 2. Expired JWT Rejection');

    // Sign a JWT with the same secret but exp already in the past
    const expiredToken = jwt.sign(
        { id: 'fake_user_id', email, role: 'user', jti: 'test-expired' },
        JWT_SECRET,
        { expiresIn: -1 }   // negative = already expired
    );

    const expiredProfile = await request('GET', '/api/auth/profile', null, auth(expiredToken));
    test('Expired JWT is rejected (not 200)', expiredProfile.status !== 200,
        `HTTP ${expiredProfile.status}`);
    test('Expired JWT returns 401',          expiredProfile.status === 401,
        `HTTP ${expiredProfile.status}`);

    const expiredSessions = await request('GET', '/api/sessions', null, auth(expiredToken));
    test('Expired JWT rejected on sessions endpoint', expiredSessions.status === 401,
        `HTTP ${expiredSessions.status}`);

    // ── 3. Session Revocation ────────────────────────────────────────────────
    console.log('\n🚫 3. Session Revocation');

    // Login a second time to get a fresh session we can revoke while keeping current
    const login2Res  = await request('POST', '/api/auth/login', { email, password });
    const token2     = login2Res.data?.data?.token;
    const sessionId2 = login2Res.data?.data?.sessionId;

    test('Second login succeeds',           login2Res.status === 200);
    test('Second login has distinct token', token !== token2);

    // Revoke session2 using token2's own auth
    const revokeRes = await request('DELETE', `/api/sessions/${sessionId2}`, null, auth(token2));
    test('Revoke session via DELETE /sessions/:id returns 200',
        revokeRes.status === 200,
        `HTTP ${revokeRes.status}: ${revokeRes.data?.message || revokeRes.data?.error || ''}`);

    // Session-required endpoint with revoked token2 — requireSession should block it
    const revokedReq = await request('DELETE', '/api/sessions/others/all', null, auth(token2));
    test('Revoked session blocked on requireSession endpoint (not 200)',
        revokedReq.status !== 200,
        `HTTP ${revokedReq.status}`);

    // Original token (session1) still works
    const stillValid = await request('GET', '/api/auth/profile', null, auth(token));
    test('Original session still valid after revoking a different session',
        stillValid.status === 200, `HTTP ${stillValid.status}`);

    // ── 4. Refresh Token ─────────────────────────────────────────────────────
    console.log('\n♻️  4. Refresh Token');

    const refreshRes = await request('POST', '/api/auth/refresh-token', { refreshToken: refreshTk });
    test('POST /refresh-token returns 200',
        refreshRes.status === 200,
        `HTTP ${refreshRes.status}: ${refreshRes.data?.message || refreshRes.data?.error || ''}`);

    const newToken = refreshRes.data?.data?.token || refreshRes.data?.token;
    test('Refresh returns new access token', !!newToken, newToken ? 'present' : 'missing');
    test('New token is different from original', newToken !== token,
        newToken ? 'rotated' : 'unchanged');

    if (newToken) {
        const refreshedProfile = await request('GET', '/api/auth/profile', null, auth(newToken));
        test('New token works for authenticated requests',
            refreshedProfile.status === 200, `HTTP ${refreshedProfile.status}`);
    }

    // Invalid refresh token should be rejected
    const badRefresh = await request('POST', '/api/auth/refresh-token', { refreshToken: 'invalid.token.value' });
    test('Invalid refresh token rejected (not 200)', badRefresh.status !== 200,
        `HTTP ${badRefresh.status}`);

    // ── 5. Session Listing ───────────────────────────────────────────────────
    console.log('\n📋 5. Session Listing');

    const currentToken = newToken || token;

    const sessionsRes = await request('GET', '/api/sessions', null, auth(currentToken));
    test('GET /sessions returns 200', sessionsRes.status === 200, `HTTP ${sessionsRes.status}`);

    const sessions = sessionsRes.data?.data?.sessions || sessionsRes.data?.data || [];
    const sessCount = Array.isArray(sessions) ? sessions.length : 0;
    test('At least 1 active session returned', sessCount >= 1, `count: ${sessCount}`);

    if (sessCount > 0) {
        const s = sessions[0];
        test('Session has createdAt field',    !!s.createdAt);
        test('Session has lastActiveAt field', !!s.lastActiveAt);
        test('Session has deviceInfo field',   s.deviceInfo !== undefined);
    }

    const countRes = await request('GET', '/api/sessions/count', null, auth(currentToken));
    test('GET /sessions/count returns 200', countRes.status === 200, `HTTP ${countRes.status}`);

    const count = countRes.data?.data?.count ?? countRes.data?.count;
    test('Session count is a positive number', typeof count === 'number' && count >= 1,
        `count: ${count}`);

    // ── 6. Session Activity Update ───────────────────────────────────────────
    console.log('\n📡 6. Session Activity Update');

    // Get lastActiveAt before
    const sessBeforeRes = await request('GET', '/api/sessions', null, auth(currentToken));
    const sesssBefore = sessBeforeRes.data?.data?.sessions || sessBeforeRes.data?.data || [];
    const lastActiveBefore = sesssBefore[0]?.lastActiveAt;

    await sleep(1100); // ensure timestamp differs

    // Make a request to trigger lastActiveAt update
    await request('GET', '/api/auth/profile', null, auth(currentToken));

    const sessAfterRes = await request('GET', '/api/sessions', null, auth(currentToken));
    const sesssAfter = sessAfterRes.data?.data?.sessions || sessAfterRes.data?.data || [];
    const lastActiveAfter = sesssAfter[0]?.lastActiveAt;

    test('lastActiveAt is present on session', !!lastActiveBefore);
    test('lastActiveAt updates after making a request',
        lastActiveBefore !== lastActiveAfter,
        `before: ${lastActiveBefore}, after: ${lastActiveAfter}`);

    // ── 7. Revoke All Other Sessions ─────────────────────────────────────────
    console.log('\n🧹 7. Revoke All Other Sessions');

    // Login twice more to create additional sessions
    const loginA = await request('POST', '/api/auth/login', { email, password });
    const loginB = await request('POST', '/api/auth/login', { email, password });
    const tokenA = loginA.data?.data?.token;
    const tokenB = loginB.data?.data?.token;

    test('Third login succeeds',  loginA.status === 200);
    test('Fourth login succeeds', loginB.status === 200);

    const countBefore = await request('GET', '/api/sessions/count', null, auth(currentToken));
    const numBefore = countBefore.data?.data?.count ?? countBefore.data?.count ?? 0;
    test('Multiple sessions exist before revoking others', numBefore >= 2,
        `session count: ${numBefore}`);

    const revokeOthersRes = await request('DELETE', '/api/sessions/others/all', null, auth(currentToken));
    test('DELETE /sessions/others/all returns 200',
        revokeOthersRes.status === 200,
        `HTTP ${revokeOthersRes.status}: ${revokeOthersRes.data?.message || revokeOthersRes.data?.error || ''}`);

    const countAfterOthers = await request('GET', '/api/sessions/count', null, auth(currentToken));
    const numAfterOthers = countAfterOthers.data?.data?.count ?? countAfterOthers.data?.count ?? 0;
    test('Only 1 session remains after revoking others', numAfterOthers === 1,
        `session count: ${numAfterOthers}`);

    // currentToken still works; tokenA/B should be blocked on requireSession endpoints
    const currentStillWorks = await request('GET', '/api/auth/profile', null, auth(currentToken));
    test('Current session still valid after revoking others',
        currentStillWorks.status === 200, `HTTP ${currentStillWorks.status}`);

    if (tokenA) {
        const revokedA = await request('DELETE', '/api/sessions/others/all', null, auth(tokenA));
        test('Revoked session A blocked on requireSession endpoint',
            revokedA.status !== 200, `HTTP ${revokedA.status}`);
    }

    // ── 8. Revoke All Sessions ───────────────────────────────────────────────
    console.log('\n💥 8. Revoke All Sessions');

    const revokeAllRes = await request('DELETE', '/api/sessions/all', null, auth(currentToken));
    test('DELETE /sessions/all returns 200',
        revokeAllRes.status === 200,
        `HTTP ${revokeAllRes.status}: ${revokeAllRes.data?.message || revokeAllRes.data?.error || ''}`);

    // Login fresh to check count is really 0
    const freshLogin = await request('POST', '/api/auth/login', { email, password });
    const freshToken = freshLogin.data?.data?.token;

    if (freshToken) {
        const countFinal = await request('GET', '/api/sessions/count', null, auth(freshToken));
        const numFinal = countFinal.data?.data?.count ?? countFinal.data?.count ?? 0;
        test('Session count is 1 after fresh login (all others gone)', numFinal === 1,
            `count: ${numFinal}`);

        // Clean up
        await request('DELETE', '/api/sessions/all', null, auth(freshToken));
    }

    // ── Done ─────────────────────────────────────────────────────────────────
    printSummary();
}

function printSummary() {
    const passed = results.passed.length;
    const failed = results.failed.length;
    const total  = results.total;
    console.log('\n' + '═'.repeat(60));
    console.log('  Session Expiry & Lifecycle Tests');
    console.log('═'.repeat(60));
    console.log(`  ✅ Passed: ${passed} / ${total}`);
    if (failed > 0) {
        console.log(`  ❌ Failed: ${failed} / ${total}`);
        results.failed.forEach(n => console.log(`     • ${n}`));
    }
    console.log('═'.repeat(60) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
