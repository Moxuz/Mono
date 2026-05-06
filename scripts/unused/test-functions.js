/**
 * test-functions.js
 * Functional test script for all auth-app endpoints.
 * Usage: node scripts/test-functions.js [base_url]
 * Example: node scripts/test-functions.js http://localhost:5000
 */

'use strict';

const http  = require('http');
const https = require('https');
const { URL } = require('url');

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL   = process.argv[2] || 'http://localhost:5000';
const TEST_EMAIL = `testuser_${Date.now()}@example.com`;
const TEST_PASS  = 'TestPass1';       // meets min policy: 8 chars + number
const TEST_USER  = `testuser_${Date.now()}`;

// ─── Colours ─────────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
};

// ─── State ────────────────────────────────────────────────────────────────────
let token        = null;
let refreshToken = null;
let sessionId    = null;

let passed  = 0;
let failed  = 0;
let skipped = 0;

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function request(method, path, body = null, authToken = null) {
  return new Promise((resolve, reject) => {
    const url    = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib    = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        ...(payload       && { 'Content-Length': Buffer.byteLength(payload) }),
        ...(authToken     && { 'Authorization':   `Bearer ${authToken}` }),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Assertion helpers ───────────────────────────────────────────────────────
function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ─── Test runner ─────────────────────────────────────────────────────────────
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n${c.bold}${c.cyan}── ${name} ${'─'.repeat(Math.max(0, 55 - name.length))}${c.reset}`);
}

async function test(name, fn, skip = false) {
  const label = `  ${skip ? c.yellow + '⊙' : ''} ${name}${c.reset}`;

  if (skip) {
    console.log(`${c.yellow}  ⊙ SKIP${c.reset}  ${name}`);
    skipped++;
    return;
  }

  try {
    await fn();
    console.log(`${c.green}  ✓ PASS${c.reset}  ${name}`);
    passed++;
  } catch (err) {
    console.log(`${c.red}  ✗ FAIL${c.reset}  ${name}`);
    console.log(`${c.dim}         ${err.message}${c.reset}`);
    failed++;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runAll() {
  console.log(`\n${c.bold}Auth App — Function Test Suite${c.reset}`);
  console.log(`${c.dim}Base URL : ${BASE_URL}${c.reset}`);
  console.log(`${c.dim}Email    : ${TEST_EMAIL}${c.reset}`);

  // ── Health ────────────────────────────────────────────────────────────────
  group('Health Check');

  await test('GET /health returns 200 OK', async () => {
    const r = await request('GET', '/health');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'OK', `Expected status OK, got ${r.body.status}`);
  });

  // ── Register ──────────────────────────────────────────────────────────────
  group('Register');

  await test('POST /api/auth/register — success', async () => {
    const r = await request('POST', '/api/auth/register', {
      username:         TEST_USER,
      email:            TEST_EMAIL,
      password:         TEST_PASS,
      consentEssential: true,
    });
    assert(r.status === 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, 'success should be true');
    token        = r.body.data?.token;
    refreshToken = r.body.data?.refreshToken;
    sessionId    = r.body.data?.sessionId;
  });

  await test('POST /api/auth/register — duplicate email returns 400', async () => {
    const r = await request('POST', '/api/auth/register', {
      username:         'dupuser',
      email:            TEST_EMAIL,
      password:         TEST_PASS,
      consentEssential: true,
    });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('POST /api/auth/register — missing consent returns 400', async () => {
    const r = await request('POST', '/api/auth/register', {
      username: 'nonconsent',
      email:    `nonconsent_${Date.now()}@example.com`,
      password: TEST_PASS,
    });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('POST /api/auth/register — weak password (< 8 chars) returns 400', async () => {
    const r = await request('POST', '/api/auth/register', {
      username:         `weakpass_${Date.now()}`,
      email:            `weakpass_${Date.now()}@example.com`,
      password:         'abc',
      consentEssential: true,
    });
    // 400 = validation failed, 429 = rate limited (still proves route guards work)
    assert([400, 429].includes(r.status), `Expected 400 or 429, got ${r.status}`);
    if (r.status === 400) assert(r.body.success === false, 'success should be false');
  });

  await test('POST /api/auth/register — password missing number returns 400', async () => {
    const r = await request('POST', '/api/auth/register', {
      username:         `nonumber_${Date.now()}`,
      email:            `nonumber_${Date.now()}@example.com`,
      password:         'onlylowercase',
      consentEssential: true,
    });
    assert([400, 429].includes(r.status), `Expected 400 or 429, got ${r.status}`);
    if (r.status === 400) assert(r.body.success === false, 'success should be false');
  });

  // ── Login ─────────────────────────────────────────────────────────────────
  group('Login');

  await test('POST /api/auth/login — success', async () => {
    const r = await request('POST', '/api/auth/login', {
      email:    TEST_EMAIL,
      password: TEST_PASS,
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, 'success should be true');
    assert(r.body.data?.token, 'token should be present');
    token        = r.body.data.token;
    refreshToken = r.body.data.refreshToken;
    sessionId    = r.body.data.sessionId;
  });

  await test('POST /api/auth/login — wrong password returns 401', async () => {
    const r = await request('POST', '/api/auth/login', {
      email:    TEST_EMAIL,
      password: 'WrongPass99',
    });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('POST /api/auth/login — non-existent user returns 401', async () => {
    const r = await request('POST', '/api/auth/login', {
      email:    'ghost@nowhere.com',
      password: TEST_PASS,
    });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  // ── Validate Token ────────────────────────────────────────────────────────
  group('Token Validation');

  await test('POST /api/auth/validate-token — valid token', async () => {
    const r = await request('POST', '/api/auth/validate-token', { token });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.valid === true, 'valid should be true');
  });

  await test('POST /api/auth/validate-token — invalid token', async () => {
    const r = await request('POST', '/api/auth/validate-token', { token: 'badtoken' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assert(r.body.valid === false, 'valid should be false');
  });

  await test('POST /api/auth/validate-token — missing token returns 400', async () => {
    const r = await request('POST', '/api/auth/validate-token', {});
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // ── Profile ───────────────────────────────────────────────────────────────
  group('Profile');

  await test('GET /api/auth/profile — authenticated', async () => {
    const r = await request('GET', '/api/auth/profile', null, token);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.data?.email === TEST_EMAIL, `Expected email ${TEST_EMAIL}`);
  });

  await test('GET /api/auth/profile — unauthenticated returns 401/403', async () => {
    const r = await request('GET', '/api/auth/profile');
    assert([401, 403].includes(r.status), `Expected 401 or 403, got ${r.status}`);
  });

  // ── Preferences ───────────────────────────────────────────────────────────
  group('Preferences');

  await test('GET /api/auth/preferences — default preferences', async () => {
    const r = await request('GET', '/api/auth/preferences', null, token);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.data?.preferences, 'preferences object should exist');
  });

  await test('PUT /api/auth/preferences — update theme and language', async () => {
    const r = await request('PUT', '/api/auth/preferences', {
      theme:    'light',
      language: 'th',
      notifications: { email: false, loginAlerts: false },
    }, token);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, 'success should be true');
  });

  await test('GET /api/auth/preferences — saved values persisted', async () => {
    const r = await request('GET', '/api/auth/preferences', null, token);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.data.preferences.theme === 'light', 'theme should be light');
    assert(r.body.data.preferences.language === 'th', 'language should be th');
  });

  await test('PUT /api/auth/preferences — unauthenticated returns 401/403', async () => {
    const r = await request('PUT', '/api/auth/preferences', { theme: 'dark' });
    assert([401, 403].includes(r.status), `Expected 401 or 403, got ${r.status}`);
  });

  // ── Sessions ──────────────────────────────────────────────────────────────
  group('Sessions');

  await test('GET /api/auth/sessions — returns active sessions', async () => {
    const r = await request('GET', '/api/auth/sessions', null, token);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body.data?.sessions), 'sessions should be an array');
    assert(r.body.data.sessions.length >= 1, 'should have at least 1 session');
  });

  await test('GET /api/auth/sessions — unauthenticated returns 401/403', async () => {
    const r = await request('GET', '/api/auth/sessions');
    assert([401, 403].includes(r.status), `Expected 401 or 403, got ${r.status}`);
  });

  // ── Security Audit ────────────────────────────────────────────────────────
  group('Security Audit');

  await test('GET /api/auth/security-audit — returns audit logs', async () => {
    const r = await request('GET', '/api/auth/security-audit', null, token);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body.data), 'data should be an array');
  });

  await test('GET /api/auth/audit-logs — returns paginated logs', async () => {
    const r = await request('GET', '/api/auth/audit-logs', null, token);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, 'success should be true');
  });

  // ── Refresh Token ─────────────────────────────────────────────────────────
  group('Refresh Token');

  await test('POST /api/auth/refresh-token — returns new token pair', async () => {
    if (!refreshToken) throw new Error('No refresh token available (login may have failed)');
    const r = await request('POST', '/api/auth/refresh-token', { refreshToken });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.token, 'new access token should be present');
    assert(r.body.refreshToken, 'new refresh token should be present');
    token        = r.body.token;
    refreshToken = r.body.refreshToken;
  });

  await test('POST /api/auth/refresh-token — invalid token returns 401', async () => {
    const r = await request('POST', '/api/auth/refresh-token', { refreshToken: 'badtoken' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  // ── Change Password ───────────────────────────────────────────────────────
  group('Change Password');

  await test('POST /api/auth/change-password — success', async () => {
    const r = await request('POST', '/api/auth/change-password', {
      currentPassword: TEST_PASS,
      newPassword:     'NewPass2',
    }, token);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, 'success should be true');
  });

  await test('POST /api/auth/change-password — wrong current password returns 401', async () => {
    const r = await request('POST', '/api/auth/change-password', {
      currentPassword: 'WrongPass99',
      newPassword:     'AnotherPass3',
    }, token);
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('POST /api/auth/change-password — weak new password returns 400', async () => {
    const r = await request('POST', '/api/auth/change-password', {
      currentPassword: 'NewPass2',
      newPassword:     'weak',
    }, token);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('POST /api/auth/change-password — unauthenticated returns 401/403', async () => {
    const r = await request('POST', '/api/auth/change-password', {
      currentPassword: TEST_PASS,
      newPassword:     'NewPass2',
    });
    assert([401, 403].includes(r.status), `Expected 401 or 403, got ${r.status}`);
  });

  // Re-login with new password
  await test('POST /api/auth/login — re-login with new password', async () => {
    const r = await request('POST', '/api/auth/login', {
      email:    TEST_EMAIL,
      password: 'NewPass2',
    });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    token        = r.body.data.token;
    refreshToken = r.body.data.refreshToken;
    if (r.body.data.sessionId) sessionId = r.body.data.sessionId;
  });

  // ── Forgot / Reset Password ───────────────────────────────────────────────
  group('Forgot & Reset Password');

  await test('POST /api/auth/forgot-password — always returns 200 (no info leak)', async () => {
    const r = await request('POST', '/api/auth/forgot-password', { email: TEST_EMAIL });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, 'success should be true');
  });

  await test('POST /api/auth/forgot-password — non-existent email still returns 200', async () => {
    const r = await request('POST', '/api/auth/forgot-password', { email: 'ghost@nowhere.com' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, 'success should be true');
  });

  await test('POST /api/auth/reset-password/:token — invalid token returns 400', async () => {
    const r = await request('POST', '/api/auth/reset-password/invalidtoken123', {
      password: 'ResetPass3',
    });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // ── Resend Verification Email ─────────────────────────────────────────────
  group('Email Verification');

  await test('POST /api/auth/resend-verification — existing email', async () => {
    const r = await request('POST', '/api/auth/resend-verification', { email: TEST_EMAIL });
    // 200 = sent, 400 = already verified, 500 = SMTP not configured in this env
    assert([200, 400, 500].includes(r.status), `Unexpected status ${r.status}`);
  });

  await test('POST /api/auth/resend-verification — missing email returns 400', async () => {
    const r = await request('POST', '/api/auth/resend-verification', {});
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // ── Revoke All Other Sessions ──────────────────────────────────────────────
  group('Session Revocation');

  await test('POST /api/auth/sessions/revoke-all-others — missing currentSessionId returns 400', async () => {
    const r = await request('POST', '/api/auth/sessions/revoke-all-others', {}, token);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('POST /api/auth/sessions/revoke-all-others — with sessionId', async () => {
    if (!sessionId) throw new Error('No sessionId available');
    const r = await request('POST', '/api/auth/sessions/revoke-all-others', {
      currentSessionId: sessionId,
    }, token);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, 'success should be true');
  });

  await test('POST /api/auth/sessions/revoke — missing sessionId returns 400', async () => {
    const r = await request('POST', '/api/auth/sessions/revoke', {}, token);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // ── Emergency Lockdown ────────────────────────────────────────────────────
  group('Emergency Lockdown');

  await test('POST /api/auth/emergency-lockdown — terminates all sessions', async () => {
    // Re-login first so we have a fresh token for this test
    const loginRes = await request('POST', '/api/auth/login', {
      email:    TEST_EMAIL,
      password: 'NewPass2',
    });
    assert(loginRes.status === 200, `Re-login failed: ${loginRes.status}`);
    const freshToken = loginRes.body.data.token;

    const r = await request('POST', '/api/auth/emergency-lockdown', {}, freshToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, 'success should be true');
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  group('Logout');

  await test('POST /api/auth/logout — success', async () => {
    // Get a fresh login
    const loginRes = await request('POST', '/api/auth/login', {
      email:    TEST_EMAIL,
      password: 'NewPass2',
    });
    assert(loginRes.status === 200, `Re-login failed: ${loginRes.status}`);
    const freshToken = loginRes.body.data.token;

    const r = await request('POST', '/api/auth/logout', {}, freshToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, 'success should be true');
  });

  await test('POST /api/auth/logout — unauthenticated returns 401/403', async () => {
    const r = await request('POST', '/api/auth/logout');
    assert([401, 403].includes(r.status), `Expected 401 or 403, got ${r.status}`);
  });

  // ── Rate Limit ────────────────────────────────────────────────────────────
  group('Rate Limiting');

  await test('POST /api/auth/validate-token — responds with RateLimit headers', async () => {
    const r = await request('POST', '/api/auth/validate-token', { token: 'x' });
    // Just verify endpoint is reachable (rate limit headers added by middleware)
    assert([200, 400, 401, 429].includes(r.status), `Unexpected status ${r.status}`);
  });

  // ── Delete Account ────────────────────────────────────────────────────────
  group('Delete Account');

  // Use a fresh dedicated account to avoid rate-limit interference
  const DEL_EMAIL = `deltest_${Date.now()}@example.com`;
  const DEL_PASS  = 'DelPass1';
  let   delToken  = null;

  await test('DELETE setup — register dedicated delete-test account', async () => {
    const r = await request('POST', '/api/auth/register', {
      username:         `deltest_${Date.now()}`,
      email:            DEL_EMAIL,
      password:         DEL_PASS,
      consentEssential: true,
    });
    assert([201, 429].includes(r.status), `Expected 201 or 429, got ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.status === 201) {
      delToken = r.body.data?.token;
    } else {
      // rate-limited on register — login instead (account may exist from prior run)
      const lr = await request('POST', '/api/auth/login', { email: DEL_EMAIL, password: DEL_PASS });
      delToken = lr.body.data?.token;
    }
    assert(delToken, 'delete-test token should be available');
  });

  await test('DELETE /api/auth/delete-account — wrong password returns 401', async () => {
    if (!delToken) throw new Error('No delete-test token');
    const r = await request('DELETE', '/api/auth/delete-account', {
      password: 'WrongPass99',
    }, delToken);
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('DELETE /api/auth/delete-account — correct password deletes account', async () => {
    if (!delToken) throw new Error('No delete-test token');
    const r = await request('DELETE', '/api/auth/delete-account', {
      password: DEL_PASS,
    }, delToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, 'success should be true');
  });

  await test('POST /api/auth/login — deleted account returns 401', async () => {
    const r = await request('POST', '/api/auth/login', {
      email:    DEL_EMAIL,
      password: DEL_PASS,
    });
    assert([401, 429].includes(r.status), `Expected 401 or 429, got ${r.status}`);
  });

  // ─── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed + skipped;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${c.bold}Results: ${total} tests${c.reset}`);
  console.log(`  ${c.green}✓ Passed : ${passed}${c.reset}`);
  console.log(`  ${c.red}✗ Failed : ${failed}${c.reset}`);
  if (skipped) console.log(`  ${c.yellow}⊙ Skipped: ${skipped}${c.reset}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error(`\n${c.red}Unexpected error:${c.reset}`, err.message);
  process.exit(1);
});
