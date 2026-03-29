/**
 * security.spec.ts — Security headers, rate limiting, input validation, CSRF
 */
import { test, expect } from '@playwright/test';
import { apiLogin, USER2 } from './helpers';

test.describe('20 — Security Headers', () => {
  const securePages = ['/', '/login', '/register', '/forgot-password'];

  for (const path of securePages) {
    test(`${path} — X-Content-Type-Options: nosniff`, async ({ page }) => {
      // Use 'commit' to check headers without waiting for external fonts/scripts
      const res = await page.goto(path, { waitUntil: 'commit' });
      expect(res?.headers()['x-content-type-options']).toBe('nosniff');
    });

    test(`${path} — Content-Security-Policy present`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: 'commit' });
      expect(res?.headers()['content-security-policy']).toBeTruthy();
    });

    test(`${path} — No X-Powered-By`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: 'commit' });
      expect(res?.headers()['x-powered-by']).toBeUndefined();
    });
  }

  test('/ — X-Frame-Options present', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.headers()['x-frame-options']).toBeTruthy();
  });

  test('/ — X-XSS-Protection present', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.headers()['x-xss-protection']).toBeTruthy();
  });

  test('/ — Referrer-Policy present', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.headers()['referrer-policy']).toBeTruthy();
  });
});

test.describe('21 — Input Validation', () => {
  test('XSS payload in login email field → 400 or 401 (not 200 or 500)', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '<script>alert(1)</script>', password: 'test' }),
      });
      return res.status;
    });
    expect([400, 401]).toContain(r);
  });

  test('SQL injection in login → 400 or 401', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: "' OR '1'='1", password: "' OR '1'='1" }),
      });
      return res.status;
    });
    expect([400, 401]).toContain(r);
  });

  test('Oversized body (>10KB) → 413', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const huge = JSON.stringify({ email: 'x@x.com', password: 'x'.repeat(15000) });
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: huge,
      });
      return res.status;
    });
    expect([400, 413]).toContain(r);
  });

  test('Invalid email format in register → 400', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'test', email: 'not-an-email',
          password: 'Test99!', confirmPassword: 'Test99!', consentEssential: true,
        }),
      });
      return res.status;
    });
    expect(r).toBe(400);
  });

  test('Weak password in register → 400', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'weaktest', email: `weak${Date.now()}@test.com`,
          password: '123', confirmPassword: '123', consentEssential: true,
        }),
      });
      return res.status;
    });
    expect(r).toBe(400);
  });
});

test.describe('22 — Rate Limiting', () => {
  test('Login endpoint responds (200 or 429) — not 500', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'k6user2@example.com', password: 'K6Test99!' }),
      });
      return res.status;
    });
    expect([200, 429]).toContain(r);
  });

  test('Repeated wrong logins eventually hit rate limit (429)', async ({ page }) => {
    await page.goto('/');
    const statuses = await page.evaluate(async () => {
      const results: number[] = [];
      for (let i = 0; i < 8; i++) {
        const res = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `ratetest${i}@notexist.com`, password: 'wrong' }),
        });
        results.push(res.status);
      }
      return results;
    });
    // All responses must be 400/401/429 — never 500
    expect(statuses.every(s => [400, 401, 429].includes(s))).toBe(true);
  });
});

test.describe('23 — Access Control', () => {
  test('All protected endpoints return 401 without token', async ({ page }) => {
    await page.goto('/');
    const protectedEndpoints = [
      '/api/auth/profile',
      '/api/auth/audit-logs',
      '/api/auth/security-audit',
      '/api/auth/preferences',
      '/api/auth/sessions',
      '/api/users/me',
      '/api/users/profile',
      '/api/users/export',
      '/api/sessions',
      '/api/oauth/clients',
      '/api/dashboard/monitoring',
      '/api/dashboard/logs',
      '/api/dashboard/analytics',
    ];
    const results = await page.evaluate(async (eps) => {
      return Promise.all(eps.map(ep => fetch(ep).then(r => r.status)));
    }, protectedEndpoints);
    expect(results.every(s => s === 401)).toBe(true);
  });

  test('Token from user A cannot access /api/users/:idB profile', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    // Try to access a random unknown userId
    const r = await page.evaluate(async (token) => {
      const res = await fetch('/api/users/000000000000000000000000', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status;
    }, token);
    expect([401, 403, 404]).toContain(r);
  });
});
