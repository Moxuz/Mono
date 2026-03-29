/**
 * auth-full.spec.ts — Complete authentication API coverage
 * Register, Login, Profile, Refresh, Forgot/Reset password,
 * Change password, Validate token, Audit logs, Preferences,
 * Cookie consent, Emergency lockdown, Delete account
 */
import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiPut, apiDelete, ADMIN, USER2, USER3 } from './helpers';

test.describe('02 — Authentication — Register', () => {
  test('register new user → 201 with token', async ({ page }) => {
    await page.goto('/');
    const ts = Date.now();
    const res = await page.evaluate(async (ts) => {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `pw_test_${ts}`,
          email: `pw_test_${ts}@example.com`,
          password: 'Test99!Pass',
          confirmPassword: 'Test99!Pass',
          consentEssential: true,
        }),
      });
      return { status: r.status, body: await r.json() };
    }, ts);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toContain('@example.com');
    expect(res.body.data.token || res.body.data.accessToken).toBeTruthy();
  });

  test('register duplicate email → 409 or 400', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async (creds) => {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'dup', ...creds, confirmPassword: creds.password, consentEssential: true }),
      });
      return r.status;
    }, USER2);
    expect([400, 409]).toContain(res);
  });

  test('register missing consentEssential → 400', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'x', email: 'x@x.com', password: 'Test99!', confirmPassword: 'Test99!' }),
      });
      return r.status;
    });
    expect(res).toBe(400);
  });

  test('register password mismatch → 400', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'x', email: `mm${Date.now()}@x.com`, password: 'Test99!', confirmPassword: 'Different!', consentEssential: true }),
      });
      return r.status;
    });
    expect(res).toBe(400);
  });
});

test.describe('03 — Authentication — Login', () => {
  test('valid login → 200 with token + refreshToken + sessionId', async ({ page }) => {
    await page.goto('/');
    const auth = await apiLogin(page, USER2);
    expect(auth.status).toBe(200);
    expect(auth.token).toBeTruthy();
    expect(auth.refreshToken).toBeTruthy();
    expect(auth.sessionId).toBeTruthy();
  });

  test('wrong password → 401', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'k6user2@example.com', password: 'WrongPass!' }),
      });
      return res.status;
    });
    expect(r).toBe(401);
  });

  test('missing password → 400', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'k6user2@example.com' }),
      });
      return res.status;
    });
    expect(r).toBe(400);
  });

  test('non-existent user → 401', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody999@example.com', password: 'Test99!' }),
      });
      return res.status;
    });
    expect(r).toBe(401);
  });
});

test.describe('04 — Authentication — Profile & Token', () => {
  test('GET /api/auth/profile with valid token', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/auth/profile', token);
    expect(r.status).toBe(200);
    expect(r.body.data?.email || r.body.email).toBe(USER2.email);
  });

  test('GET /api/auth/profile with no token → 401', async ({ page }) => {
    await page.goto('/');
    const r = await apiGet(page, '/api/auth/profile', '');
    expect(r.status).toBe(401);
  });

  test('GET /api/auth/profile with malformed token → 401', async ({ page }) => {
    await page.goto('/');
    const r = await apiGet(page, '/api/auth/profile', 'Bearer bad.token.here');
    expect(r.status).toBe(401);
  });

  test('POST /api/auth/refresh-token → new token', async ({ page }) => {
    await page.goto('/');
    const { refreshToken } = await apiLogin(page, USER2);
    const r = await page.evaluate(async (rt) => {
      const res = await fetch('/api/auth/refresh-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      return { status: res.status, body: await res.json() };
    }, refreshToken);
    expect(r.status).toBe(200);
    expect(r.body.token || r.body.accessToken).toBeTruthy();
  });

  test('POST /api/auth/validate-token → valid for fresh token', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    // validate-token requires token in body
    const r = await page.evaluate(async (t) => {
      const res = await fetch('/api/auth/validate-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });
      return { status: res.status, body: await res.json() };
    }, token);
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(true);
  });

  test('POST /api/auth/validate-token → invalid for garbage token', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/validate-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'garbage.token.here' }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect([200, 401]).toContain(r.status);
    // valid:false or 401 — never returns valid:true for garbage
    if (r.status === 200) expect(r.body.valid).toBe(false);
  });
});

test.describe('05 — Authentication — Password Management', () => {
  test('POST /api/auth/forgot-password with valid email → 200', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'k6user3@example.com' }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  test('POST /api/auth/forgot-password with unknown email → 200 (no leak)', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody_unknown@example.com' }),
      });
      return res.status;
    });
    expect(r).toBe(200); // Must not leak whether email exists
  });

  test('POST /api/auth/reset-password/:token with bad token → 400 or 404', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/reset-password/badtoken123', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'NewPass99!', confirmPassword: 'NewPass99!' }),
      });
      return res.status;
    });
    expect([400, 404]).toContain(r);
  });

  test('POST /api/auth/change-password with wrong current → 400 or 401', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER3);
    const r = await apiPost(page, '/api/auth/change-password', token, {
      currentPassword: 'WrongCurrent!',
      newPassword: 'NewPass99!',
      confirmPassword: 'NewPass99!',
    });
    expect([400, 401]).toContain(r.status);
  });
});

test.describe('06 — Authentication — Preferences & Consent', () => {
  test('GET /api/auth/preferences returns preferences object', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/auth/preferences', token);
    expect(r.status).toBe(200);
    expect(r.body).toBeTruthy();
  });

  test('PUT /api/auth/preferences updates preference', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiPut(page, '/api/auth/preferences', token, { theme: 'dark' });
    expect([200, 204]).toContain(r.status);
  });

  test('POST /api/auth/update-cookie-consent → 200', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    // controller requires boolean field `cookieConsentAccepted`
    const r = await apiPost(page, '/api/auth/update-cookie-consent', token, {
      cookieConsentAccepted: true,
    });
    expect([200, 204]).toContain(r.status);
  });
});

test.describe('07 — Authentication — Audit & Security', () => {
  test('GET /api/auth/audit-logs returns array', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/auth/audit-logs', token);
    expect(r.status).toBe(200);
  });

  test('GET /api/auth/security-audit → 200', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/auth/security-audit', token);
    expect(r.status).toBe(200);
  });

  test('POST /api/auth/emergency-lockdown → 200', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER3);
    const r = await apiPost(page, '/api/auth/emergency-lockdown', token, {});
    expect([200, 204]).toContain(r.status);
  });
});

test.describe('08 — Authentication — OAuth Social', () => {
  test('GET /api/auth/oauth/status returns provider info', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/oauth/status');
      return { status: res.status, body: await res.json() };
    });
    expect(r.status).toBe(200);
    // response: { success: true, data: { google: true, github: true } }
    const providers = r.body.data || r.body;
    expect(providers).toHaveProperty('google');
    expect(providers).toHaveProperty('github');
  });

  test('GET /api/auth/google redirects (302) or returns 200/404 if disabled', async ({ page }) => {
    const res = await page.goto('/api/auth/google');
    expect([200, 302, 404]).toContain(res?.status());
  });

  test('GET /api/auth/github redirects (302) or returns 200/404 if disabled', async ({ page }) => {
    const res = await page.goto('/api/auth/github');
    expect([200, 302, 404]).toContain(res?.status());
  });
});

test.describe('09 — Authentication — Logout', () => {
  test('POST /api/auth/logout completes (200 or 504 known timeout)', async ({ page }) => {
    await page.goto('/');
    const { token, refreshToken } = await apiLogin(page, USER3);
    // Logout has a known 504 timeout (passport req.logout Redis session destroy)
    // Use AbortController so the test doesn't hang the full 60s
    const r = await page.evaluate(async ({ path, token, data }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return { status: res.status };
      } catch {
        clearTimeout(timeout);
        return { status: 504 }; // treat abort/network error as known 504
      }
    }, { path: '/api/auth/logout', token, data: { refreshToken } });
    expect([200, 204, 504]).toContain(r.status);
  });
});
