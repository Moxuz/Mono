/**
 * Profile, Preferences, Cookie Consent, Account Management Tests
 * Requires server running at TEST_BASE_URL (default: http://localhost:5000)
 */

const { post, get, put, del } = require('./helpers/request');
const { createTestUser, cleanupUser } = require('./helpers/users');

// ─────────────────────────────────────────────────────────────────────────────

describe('Get Profile', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('profile'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('GET /api/auth/profile → 200, contains id/username/email/role', async () => {
        const res = await get('/api/auth/profile', user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        const d = res.data.data || res.data;
        expect(d.email).toBe(user.email);
        expect(d.username).toBe(user.username);
        expect(['user', 'admin', 'moderator']).toContain(d.role);
        expect(d.id || d._id).toBeTruthy();
    });

    it('GET /api/auth/profile without auth → 401', async () => {
        const res = await get('/api/auth/profile');
        expect(res.status).toBe(401);
    });

    it('GET /api/users/me → 200, same user data', async () => {
        const res = await get('/api/users/me', user.token);
        expect(res.status).toBe(200);
        const d = res.data.user || res.data.data || res.data;
        expect(d.email).toBe(user.email);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Preferences', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('prefs'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('GET /api/auth/preferences → 200, has theme/language/notifications', async () => {
        const res = await get('/api/auth/preferences', user.token);
        expect(res.status).toBe(200);
        const d = res.data.data?.preferences || res.data.data || res.data;
        expect(d).toHaveProperty('theme');
        expect(d).toHaveProperty('language');
    });

    it('PUT /api/auth/preferences { theme: "light" } → 200, theme updated', async () => {
        const res = await put('/api/auth/preferences', { theme: 'light' }, user.token);
        expect(res.status).toBe(200);
        const d = res.data.data?.preferences || res.data.data || res.data;
        expect(d.theme).toBe('light');
    });

    it('PUT /api/auth/preferences { language: "th" } → 200', async () => {
        const res = await put('/api/auth/preferences', { language: 'th' }, user.token);
        expect(res.status).toBe(200);
    });

    it('GET /api/auth/preferences without auth → 401', async () => {
        const res = await get('/api/auth/preferences');
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Cookie Consent', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('consent'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('POST /api/auth/update-cookie-consent { cookieConsentAccepted: true } → 200', async () => {
        const res = await post('/api/auth/update-cookie-consent', {
            cookieConsentAccepted: true,
        }, user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('POST /api/auth/update-cookie-consent { cookieConsentAccepted: false } → 200', async () => {
        const res = await post('/api/auth/update-cookie-consent', {
            cookieConsentAccepted: false,
        }, user.token);
        expect(res.status).toBe(200);
    });

    it('non-boolean value → 400', async () => {
        const res = await post('/api/auth/update-cookie-consent', {
            cookieConsentAccepted: 'yes',
        }, user.token);
        expect(res.status).toBe(400);
    });

    it('without auth → 401', async () => {
        const res = await post('/api/auth/update-cookie-consent', { cookieConsentAccepted: true });
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Audit Logs', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('auditlogs'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('GET /api/auth/audit-logs → 200, array', async () => {
        const res = await get('/api/auth/audit-logs', user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        const logs = res.data.data?.logs || res.data.data || res.data;
        expect(Array.isArray(logs)).toBe(true);
    });

    it('GET /api/auth/security-audit → 200', async () => {
        const res = await get('/api/auth/security-audit', user.token);
        expect(res.status).toBe(200);
    });

    it('GET /api/auth/audit-logs without auth → 401', async () => {
        const res = await get('/api/auth/audit-logs');
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Delete Account', () => {
    // Each test uses its own user to avoid order dependency
    it('correct password → 200, account deleted', async () => {
        const user = await createTestUser('del1');
        const res = await del('/api/auth/delete-account', { password: user.password }, user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('login with deleted account → 401', async () => {
        const user = await createTestUser('del2');
        await del('/api/auth/delete-account', { password: user.password }, user.token);
        const login = await post('/api/auth/login', { email: user.email, password: user.password });
        expect(login.status).toBe(401);
    });

    it('wrong password → 401', async () => {
        const user = await createTestUser('del3');
        const res = await del('/api/auth/delete-account', { password: 'WrongPass99!' }, user.token);
        expect(res.status).toBe(401);
        await cleanupUser(user.password, user.token);
    });

    it('without auth → 401', async () => {
        const res = await del('/api/auth/delete-account', { password: 'anything' });
        expect(res.status).toBe(401);
    });
});
