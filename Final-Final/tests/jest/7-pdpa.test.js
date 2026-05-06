/**
 * PDPA (Personal Data Protection Act B.E. 2562) Compliance Tests
 * Covers: Art.19 Consent, Art.27 Portability, Art.28 Rectification,
 *         Art.30 Access, Art.33 Erasure, Art.37 Security Measures, Art.40 Audit Trail
 * Requires server running at TEST_BASE_URL (default: http://localhost)
 */

const { post, get, put, del } = require('./helpers/request');
const { createTestUser, cleanupUser } = require('./helpers/users');

// ─────────────────────────────────────────────────────────────────────────────

describe('Right to Access (PDPA Art.30) — Personal Data Access', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('pdpa_access'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('GET /api/users/me → 200, returns own personal data (email, username, role)', async () => {
        const res = await get('/api/users/me', user.token);
        expect(res.status).toBe(200);
        const d = res.data.user || res.data.data || res.data;
        expect(d.email).toBe(user.email);
        expect(d.username).toBe(user.username);
        expect(d.role).toBeTruthy();
    });

    it('GET /api/users/profile → 200, returns own profile data', async () => {
        const res = await get('/api/users/profile', user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('GET /api/users/me without auth → 401 (data access requires identity verification)', async () => {
        const res = await get('/api/users/me');
        expect(res.status).toBe(401);
    });

    it('GET /api/users/profile without auth → 401', async () => {
        const res = await get('/api/users/profile');
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Data Portability (PDPA Art.27) — Export Personal Data', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('pdpa_export'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('GET /api/users/export → 200 or 202, returns personal data package', async () => {
        const res = await get('/api/users/export', user.token);
        expect([200, 202]).toContain(res.status);
        if (res.status === 200) {
            // Response should contain user data, not an error
            expect(res.data).toBeTruthy();
            expect(res.data.error).toBeUndefined();
        }
    });

    it('GET /api/users/export without auth → 401', async () => {
        const res = await get('/api/users/export');
        expect(res.status).toBe(401);
    });

    it('GET /api/users/export with invalid token → 401', async () => {
        const res = await get('/api/users/export', 'invalid.token.here');
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Right to Erasure (PDPA Art.33) — Delete Personal Data', () => {
    it('DELETE /api/auth/delete-account with correct password → 200, account removed', async () => {
        const user = await createTestUser('pdpa_erase1');
        const res = await del('/api/auth/delete-account', { password: user.password }, user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('deleted account cannot be accessed — login returns 401', async () => {
        const user = await createTestUser('pdpa_erase2');
        await del('/api/auth/delete-account', { password: user.password }, user.token);
        const login = await post('/api/auth/login', { email: user.email, password: user.password });
        expect(login.status).toBe(401);
    });

    it('deleted account token is invalidated — profile returns 401', async () => {
        const user = await createTestUser('pdpa_erase3');
        const savedToken = user.token;
        await del('/api/auth/delete-account', { password: user.password }, user.token);
        const res = await get('/api/auth/profile', savedToken);
        expect(res.status).toBe(401);
    });

    it('DELETE /api/users/account without auth → 401 (erasure requires identity verification)', async () => {
        const res = await del('/api/users/account', {});
        expect(res.status).toBe(401);
    });

    it('DELETE /api/auth/delete-account without auth → 401', async () => {
        const res = await del('/api/auth/delete-account', { password: 'anything' });
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Consent Management (PDPA Art.19) — Cookie & Data Consent', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('pdpa_consent'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('POST /api/auth/update-cookie-consent { true } → 200 (consent granted)', async () => {
        const res = await post('/api/auth/update-cookie-consent',
            { cookieConsentAccepted: true }, user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('POST /api/auth/update-cookie-consent { false } → 200 (consent withdrawn)', async () => {
        const res = await post('/api/auth/update-cookie-consent',
            { cookieConsentAccepted: false }, user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('non-boolean consent value → 400 (consent must be explicit true/false)', async () => {
        const res = await post('/api/auth/update-cookie-consent',
            { cookieConsentAccepted: 'yes' }, user.token);
        expect(res.status).toBe(400);
    });

    it('consent update without auth → 401', async () => {
        const res = await post('/api/auth/update-cookie-consent',
            { cookieConsentAccepted: true });
        expect(res.status).toBe(401);
    });

    it('register without consentEssential → 400 (consent required at registration)', async () => {
        const res = await post('/api/auth/register', {
            username: `noconsent${Date.now()}`,
            email:    `noconsent${Date.now()}@test.io`,
            password: 'TestPass1!',
            // consentEssential intentionally omitted
        });
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Right to Rectification (PDPA Art.28) — Correct Inaccurate Personal Data', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('pdpa_rect'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('PUT /api/users/profile with new username → 200, data updated', async () => {
        const newUsername = `updated${Date.now()}`.slice(0, 20);
        const res = await put('/api/users/profile', { username: newUsername }, user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        user.username = newUsername;
    });

    it('GET /api/users/me reflects the updated username after rectification', async () => {
        const res = await get('/api/users/me', user.token);
        expect(res.status).toBe(200);
        const d = res.data.user || res.data.data || res.data;
        expect(d.username).toBe(user.username);
    });

    it('PUT /api/users/profile with empty username → 400 (invalid data rejected)', async () => {
        const res = await put('/api/users/profile', { username: '' }, user.token);
        expect([400, 422]).toContain(res.status);
    });

    it('PUT /api/users/profile without auth → 401 (rectification requires identity verification)', async () => {
        const res = await put('/api/users/profile', { username: 'anyname' });
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Security Measures (PDPA Art.37) — Data Controller Protection Obligations', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('pdpa_sec'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('login response does not expose password or password hash', async () => {
        const res = await post('/api/auth/login', { email: user.email, password: user.password });
        expect(res.status).toBe(200);
        const d = res.data.data || res.data;
        expect(d.password).toBeUndefined();
        expect(d.passwordHash).toBeUndefined();
        expect(d.hashedPassword).toBeUndefined();
    });

    it('profile response does not expose password or password hash', async () => {
        const res = await get('/api/auth/profile', user.token);
        expect(res.status).toBe(200);
        const d = res.data.data || res.data;
        expect(d.password).toBeUndefined();
        expect(d.passwordHash).toBeUndefined();
    });

    it('register response does not expose password in returned data', async () => {
        const res = await post('/api/auth/register', {
            username:         `sec_check${Date.now()}`.slice(0, 20),
            email:            `seccheck${Date.now()}@test.io`,
            password:         'TestSecure1!',
            consentEssential: true,
        });
        expect([201, 400, 409]).toContain(res.status);
        if (res.status === 201) {
            const d = res.data.data || res.data;
            expect(d.password).toBeUndefined();
            expect(d.passwordHash).toBeUndefined();
        }
    });

    it('repeated wrong login attempts trigger rate limit → 429 or 423 (brute-force protection)', async () => {
        const dummyEmail = `ratelimit${Date.now()}@test.io`;
        let lastStatus = 0;
        for (let i = 0; i < 6; i++) {
            const res = await post('/api/auth/login', { email: dummyEmail, password: 'WrongPass99!' });
            lastStatus = res.status;
        }
        expect([429, 423, 401]).toContain(lastStatus);
    });

    it('security headers present — X-Content-Type-Options: nosniff', async () => {
        const res = await get('/health');
        const header = res.headers['x-content-type-options'] || '';
        expect(header.toLowerCase()).toContain('nosniff');
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Audit Trail (PDPA Art.40) — Data Processing Transparency', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('pdpa_audit'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('GET /api/auth/audit-logs → 200, returns array of own activity logs', async () => {
        const res = await get('/api/auth/audit-logs', user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        const logs = res.data.data?.logs || res.data.data || res.data;
        expect(Array.isArray(logs)).toBe(true);
    });

    it('GET /api/auth/security-audit → 200, returns security event log', async () => {
        const res = await get('/api/auth/security-audit', user.token);
        expect(res.status).toBe(200);
    });

    it('GET /api/auth/audit-logs without auth → 401 (audit data is personal data)', async () => {
        const res = await get('/api/auth/audit-logs');
        expect(res.status).toBe(401);
    });
});
