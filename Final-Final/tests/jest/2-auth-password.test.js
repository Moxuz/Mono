/**
 * Password Flow Tests — Change Password, Forgot Password, Reset Password
 * Requires server running at TEST_BASE_URL (default: http://localhost:5000)
 */

const { post } = require('./helpers/request');
const { createTestUser, cleanupUser } = require('./helpers/users');

// ─────────────────────────────────────────────────────────────────────────────

describe('Change Password', () => {
    let user;
    const newPassword = 'ChangedX99!';

    beforeAll(async () => { user = await createTestUser('chgpwd'); });
    afterAll(async () => {
        // Re-login with new password to clean up (if changed)
        const loginRes = await post('/api/auth/login', { email: user.email, password: newPassword });
        if (loginRes.status === 200) {
            const t = (loginRes.data.data || loginRes.data).token;
            await cleanupUser(newPassword, t);
        } else {
            await cleanupUser(user.password, user.token);
        }
    });

    it('correct currentPassword → 200', async () => {
        const res = await post('/api/auth/change-password', {
            currentPassword: user.password,
            newPassword,
        }, user.token);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('can login with new password after change', async () => {
        const res = await post('/api/auth/login', { email: user.email, password: newPassword });
        expect(res.status).toBe(200);
        user.token = (res.data.data || res.data).token;
    });

    it('wrong currentPassword → 401', async () => {
        const res = await post('/api/auth/change-password', {
            currentPassword: 'WrongPass99!',
            newPassword: 'AnotherPass1',
        }, user.token);
        expect(res.status).toBe(401);
    });

    it('new password same as current → 400', async () => {
        const res = await post('/api/auth/change-password', {
            currentPassword: newPassword,
            newPassword,
        }, user.token);
        expect(res.status).toBe(400);
    });

    it('new password too weak (no number) → 400', async () => {
        const res = await post('/api/auth/change-password', {
            currentPassword: newPassword,
            newPassword: 'NoNumbers!',
        }, user.token);
        expect(res.status).toBe(400);
    });

    it('without auth token → 401', async () => {
        const res = await post('/api/auth/change-password', {
            currentPassword: newPassword,
            newPassword: 'AnotherPass1',
        });
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Forgot Password', () => {
    let user;

    beforeAll(async () => { user = await createTestUser('forgotpwd'); });
    afterAll(async () => { await cleanupUser(user.password, user.token); });

    it('registered email → 200 generic message', async () => {
        const res = await post('/api/auth/forgot-password', { email: user.email });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        // Message should not reveal whether email exists
        expect(typeof res.data.message).toBe('string');
    });

    it('non-existent email → 200 same generic message (no enumeration)', async () => {
        const res = await post('/api/auth/forgot-password', { email: 'doesnotexist@nowhere.com' });
        expect(res.status).toBe(200);
        // Must NOT return 404 — that would leak user existence
        expect(res.data.success).toBe(true);
    });

    it('missing email → 400', async () => {
        const res = await post('/api/auth/forgot-password', {});
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Reset Password', () => {
    it('invalid reset token → 400', async () => {
        const res = await post('/api/auth/reset-password/notavalidtoken123', {
            password: 'NewPassword1',
        });
        expect(res.status).toBe(400);
    });

    it('expired reset token (all-zeros fake hash) → 400', async () => {
        const fakeToken = '0'.repeat(64);
        const res = await post(`/api/auth/reset-password/${fakeToken}`, {
            password: 'NewPassword1',
        });
        expect(res.status).toBe(400);
    });

    it('missing password body → 400', async () => {
        const res = await post('/api/auth/reset-password/sometokenvalue', {});
        expect(res.status).toBe(400);
    });

    it('weak password in reset → 400', async () => {
        const res = await post('/api/auth/reset-password/sometokenvalue', {
            password: 'weak',
        });
        expect(res.status).toBe(400);
    });
});
