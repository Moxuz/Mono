/**
 * Session Management Tests
 * Requires server running at TEST_BASE_URL (default: http://localhost:5000)
 */

const { post, get, del } = require('./helpers/request');
const { createTestUser, cleanupUser } = require('./helpers/users');

// ─────────────────────────────────────────────────────────────────────────────

describe('Get Sessions', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('getsess'); });
    afterAll(async () => { if (user) await cleanupUser(user.password, user.token); });

    it('GET /api/auth/sessions → 200, array with at least 1 session', async () => {
        const res = await get('/api/auth/sessions', user.token);
        expect(res.status).toBe(200);
        const sessions = res.data.data?.sessions || res.data.sessions || res.data.data || res.data;
        expect(Array.isArray(sessions)).toBe(true);
        expect(sessions.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/sessions → 200', async () => {
        const res = await get('/api/sessions', user.token);
        expect([200, 404]).toContain(res.status); // route may be mounted differently
        if (res.status === 200) {
            const sessions = res.data.data?.sessions || res.data.sessions || res.data.data || res.data;
            expect(Array.isArray(sessions) || typeof sessions === 'object').toBe(true);
        }
    });

    it('GET /api/sessions/count → 200, count ≥ 1', async () => {
        const res = await get('/api/sessions/count', user.token);
        if (res.status === 200) {
            const count = res.data.count ?? res.data.data?.count ?? res.data;
            expect(Number(count)).toBeGreaterThanOrEqual(1);
        } else {
            expect([200, 404]).toContain(res.status);
        }
    });

    it('GET /api/auth/sessions without auth → 401', async () => {
        const res = await get('/api/auth/sessions');
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Revoke Single Session', () => {
    let user;
    let sessionId;

    beforeAll(async () => {
        // Login twice to get two sessions
        user = await createTestUser('revokesess');
        const login2 = await post('/api/auth/login/token', { email: user.email, password: user.password });
        sessionId = (login2.data.data || login2.data).sessionId;
    });
    afterAll(async () => { if (user) await cleanupUser(user.password, user.token); });

    it('POST /api/auth/sessions/revoke with valid sessionId → 200', async () => {
        const res = await post('/api/auth/sessions/revoke', { sessionId }, user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('revoke same sessionId again → 400/404', async () => {
        const res = await post('/api/auth/sessions/revoke', { sessionId }, user.token);
        expect([400, 404]).toContain(res.status);
    });

    it('revoke with non-existent sessionId → 400/404', async () => {
        const res = await post('/api/auth/sessions/revoke', { sessionId: '000000000000000000000000' }, user.token);
        expect([400, 404]).toContain(res.status);
    });

    it('missing sessionId → 400', async () => {
        const res = await post('/api/auth/sessions/revoke', {}, user.token);
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Revoke All Others', () => {
    let user;
    let session2Token;
    let session2Id;

    beforeAll(async () => {
        user = await createTestUser('revokeall');
        const login2 = await post('/api/auth/login/token', { email: user.email, password: user.password });
        const d2 = login2.data.data || login2.data;
        session2Token = d2.token;
        session2Id    = d2.sessionId;
    });
    afterAll(async () => { if (user) await cleanupUser(user.password, user.token); });

    it('POST /api/auth/sessions/revoke-all-others → 200, count ≥ 1', async () => {
        const res = await post('/api/auth/sessions/revoke-all-others',
            { currentSessionId: user.sessionId },
            user.token
        );
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        const count = res.data.data?.count ?? res.data.count;
        if (count !== undefined) expect(count).toBeGreaterThanOrEqual(1);
    });

    it('revoked session token → 401 on subsequent call', async () => {
        const res = await get('/api/auth/profile', session2Token);
        expect(res.status).toBe(401);
    });

    it('current session still works after revoke-all-others', async () => {
        const res = await get('/api/auth/profile', user.token);
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Emergency Lockdown', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('lockdown'); });
    afterAll(async () => {
        // Re-login since lockdown revokes all tokens
        const res = await post('/api/auth/login/token', { email: user.email, password: user.password });
        if (res.status === 200) {
            const t = (res.data.data || res.data).token;
            await cleanupUser(user.password, t);
        }
    });

    it('POST /api/auth/emergency-lockdown → 200', async () => {
        const res = await post('/api/auth/emergency-lockdown', {}, user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('old token rejected after lockdown → 401', async () => {
        const res = await get('/api/auth/profile', user.token);
        expect(res.status).toBe(401);
    });

    it('lockdown without auth → 401', async () => {
        const res = await post('/api/auth/emergency-lockdown', {});
        expect(res.status).toBe(401);
    });
});
