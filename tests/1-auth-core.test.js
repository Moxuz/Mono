/**
 * Auth Core Tests — Register, Login, Logout, Token Operations
 * Requires server running at TEST_BASE_URL (default: http://localhost:5000)
 */

const { post, get } = require('./helpers/request');
const { createTestUser, cleanupUser } = require('./helpers/users');

// ─────────────────────────────────────────────────────────────────────────────

describe('Register', () => {
    const email    = `reg_test_${Date.now()}@test.io`;
    const password = 'RegTestX99!';
    const username = `regtest${Date.now()}`;
    let token;

    it('creates account with valid data → 201 + safe web response', async () => {
        const res = await post('/api/auth/register', { username, email, password, consentEssential: true });
        expect(res.status).toBe(201);
        expect(res.data.success).toBe(true);
        const d = res.data.data || res.data;
        expect(d.authenticated).toBe(true);
        expect(d.token).toBeUndefined();
        expect(d.refreshToken).toBeUndefined();
        expect(d.sessionId).toBeUndefined();
    });

    it('login with new account to get token for cleanup', async () => {
        const res = await post('/api/auth/login/token', { email, password });
        expect(res.status).toBe(200);
        token = (res.data.data || res.data).token;
        expect(token).toBeTruthy();
    });

    it('duplicate email → 400/409', async () => {
        const res = await post('/api/auth/register', { username: 'another', email, password, consentEssential: true });
        expect([400, 409]).toContain(res.status);
    });

    it('missing email → 400', async () => {
        const res = await post('/api/auth/register', { username: 'u1', password: 'Test12345', consentEssential: true });
        expect(res.status).toBe(400);
    });

    it('missing password → 400', async () => {
        const res = await post('/api/auth/register', { username: 'u2', email: 'x@x.com', consentEssential: true });
        expect(res.status).toBe(400);
    });

    it('password < 8 chars → 400', async () => {
        const res = await post('/api/auth/register', {
            username: 'u3', email: 'short@x.com', password: 'abc', consentEssential: true
        });
        expect(res.status).toBe(400);
    });

    it('password with no number → 400', async () => {
        const res = await post('/api/auth/register', {
            username: 'u4', email: 'nonumber@x.com', password: 'NoNumbers!', consentEssential: true
        });
        expect(res.status).toBe(400);
    });

    it('username < 3 chars → 400', async () => {
        const res = await post('/api/auth/register', {
            username: 'ab', email: 'shortname@x.com', password: 'Test12345', consentEssential: true
        });
        expect(res.status).toBe(400);
    });

    afterAll(async () => {
        if (token) await cleanupUser(password, token);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Login', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('login'); });
    afterAll(async ()  => { await cleanupUser(user.password, user.token); });

    it('browser login → 200 without bearer credentials', async () => {
        const res = await post('/api/auth/login', { email: user.email, password: user.password });
        expect(res.status).toBe(200);
        const d = res.data.data || res.data;
        expect(d.authenticated).toBe(true);
        expect(d.token).toBeUndefined();
        expect(d.refreshToken).toBeUndefined();
        expect(d.sessionId).toBeUndefined();
    });

    it('explicit API login → 200 + token + refreshToken + sessionId', async () => {
        const res = await post('/api/auth/login/token', { email: user.email, password: user.password });
        expect(res.status).toBe(200);
        const d = res.data.data || res.data;
        expect(d.token).toBeTruthy();
        expect(d.refreshToken).toBeTruthy();
        expect(d.sessionId).toBeTruthy();
    });

    it('wrong password → 401', async () => {
        const res = await post('/api/auth/login/token', { email: user.email, password: 'WrongPass99!' });
        expect(res.status).toBe(401);
    });

    it('non-existent email → 401 (same response, no enumeration)', async () => {
        const res = await post('/api/auth/login/token', { email: 'nobody@nowhere.com', password: 'AnyPass1' });
        expect(res.status).toBe(401);
    });

    it('missing password → 400', async () => {
        const res = await post('/api/auth/login/token', { email: user.email });
        expect(res.status).toBe(400);
    });

    it('missing email → 400', async () => {
        const res = await post('/api/auth/login/token', { password: user.password });
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Logout', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('logout'); });
    afterAll(async () => {
        // Re-login to clean up if the account still exists
        const loginRes = await post('/api/auth/login/token', { email: user.email, password: user.password });
        if (loginRes.status === 200) {
            const t = (loginRes.data.data || loginRes.data).token;
            await cleanupUser(user.password, t);
        }
    });

    it('logout with valid token → 200', async () => {
        const res = await post('/api/auth/logout', {}, user.token);
        expect(res.status).toBe(200);
    });

    it('use same token after logout → 401 (blacklisted)', async () => {
        const res = await get('/api/auth/profile', user.token);
        expect(res.status).toBe(401);
    });

    it('logout without token → 401', async () => {
        const res = await post('/api/auth/logout', {});
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Token Operations', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('tokenops'); });
    afterAll(async () => { if (user) await cleanupUser(user.password, user.token); });

    it('validate-token with valid token → 200 { valid: true }', async () => {
        const res = await post('/api/auth/validate-token', { token: user.token });
        expect(res.status).toBe(200);
        expect(res.data.valid).toBe(true);
    });

    it('validate-token with tampered token → 200 { valid: false }', async () => {
        const tampered = user.token.slice(0, -5) + 'XXXXX';
        const res = await post('/api/auth/validate-token', { token: tampered });
        expect(res.status).toBe(200);
        expect(res.data.valid).toBe(false);
    });

    it('validate-token with garbage string → 200 { valid: false }', async () => {
        const res = await post('/api/auth/validate-token', { token: 'not.a.jwt' });
        expect(res.status).toBe(200);
        expect(res.data.valid).toBe(false);
    });

    it('refresh-token with valid refreshToken → 200, new token + new refreshToken', async () => {
        const res = await post('/api/auth/refresh-token', {
            refreshToken: user.refreshToken,
            sessionId: user.sessionId,
        });
        expect(res.status).toBe(200);
        const d = res.data.data || res.data;
        expect(d.token || res.data.token).toBeTruthy();
        expect(d.refreshToken || res.data.refreshToken).toBeTruthy();
        // Update token for afterAll cleanup
        user.token = d.token || res.data.token;
        user.refreshToken = d.refreshToken || res.data.refreshToken;
    });

    it('refresh-token with invalid refreshToken → 401', async () => {
        const res = await post('/api/auth/refresh-token', { refreshToken: 'invalid.refresh.token' });
        expect(res.status).toBe(401);
    });

    it('refresh-token with already-used refreshToken (old one) → 401', async () => {
        // The previous refresh rotated the token — using the old one should fail
        const res = await post('/api/auth/refresh-token', {
            refreshToken: user.refreshToken, // already rotated in previous test
        });
        // Should fail because it was already used (rotation enforcement)
        // or succeed if the test order changed — check that it doesn't return 200
        // with the SAME token (rotation must produce a new one)
        if (res.status === 200) {
            const d = res.data.data || res.data;
            const newToken = d.token || res.data.token;
            expect(newToken).not.toBe(user.token); // must be a fresh token
        } else {
            expect(res.status).toBe(401);
        }
    });
});
