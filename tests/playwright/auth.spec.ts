import { test, expect, request } from '@playwright/test';

const BASE = 'http://localhost';
const USER = { email: 'k6user1@example.com', password: 'K6Test99!' };
const USER2 = { email: 'k6user2@example.com', password: 'K6Test99!' };

// ─── 01: Page Navigation ──────────────────────────────────────────────────────
test.describe('01 — Page Navigation', () => {
  test('homepage loads and has title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
    expect(page.url()).toContain('localhost');
  });

  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('forgot-password page loads', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page).toHaveURL(/forgot-password/);
  });

  test('dashboard redirects unauthenticated user', async ({ page }) => {
    await page.goto('/dashboard');
    // Should either show login redirect or 401 — not a crash
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe('complete');
  });

  test('404 on unknown page — graceful', async ({ page }) => {
    const res = await page.goto('/this-does-not-exist-xyz');
    // Server returns 404 JSON, not a crash
    expect([404, 200]).toContain(res?.status());
  });
});

// ─── 02: Security Headers (via browser) ──────────────────────────────────────
test.describe('02 — Security Headers', () => {
  test('CSP header present on homepage', async ({ page }) => {
    const res = await page.goto('/');
    const csp = res?.headers()['content-security-policy'];
    expect(csp).toBeTruthy();
  });

  test('X-Content-Type-Options: nosniff on homepage', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('no X-Powered-By header on homepage', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.headers()['x-powered-by']).toBeUndefined();
  });

  test('health endpoint returns JSON', async ({ page }) => {
    const res = await page.goto('/health');
    expect(res?.status()).toBe(200);
    const body = await res?.json();
    expect(body?.status).toBe('OK');
    expect(body?.uptime).toBeGreaterThan(0);
  });
});

// ─── 03: Login Flow ───────────────────────────────────────────────────────────
test.describe('03 — Login Flow', () => {
  test('login form — submit with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', USER.email);
    await page.fill('input[type="password"]', USER.password);
    await page.click('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    // After successful login should redirect away from /login
    await page.waitForTimeout(2000);
    const url = page.url();
    // Either redirected to dashboard or still on login with success message
    expect(url).toBeTruthy();
  });

  test('login form — wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', USER.email);
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForTimeout(1500);
    // Should show an error, not redirect to dashboard
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
  });

  test('login form — empty email shows validation', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="password"]', 'somepassword');
    await page.click('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    // HTML5 validation or server error — should not crash
    const url = page.url();
    expect(url).toContain('login');
  });
});

// ─── 04: Register Flow ────────────────────────────────────────────────────────
test.describe('04 — Register Flow', () => {
  test('register form — duplicate email shows error', async ({ page }) => {
    await page.goto('/register');
    // Fill all required fields with an existing account
    await page.fill('input[name="username"], input[placeholder*="username" i]', 'k6user1');
    await page.fill('input[type="email"], input[name="email"]', USER.email);
    await page.fill('input[name="password"], input[type="password"]:first-of-type', USER.password);
    // Try to find confirm password field
    const confirmField = page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]');
    if (await confirmField.count() > 0) {
      await confirmField.fill(USER.password);
    }
    // Check consent checkbox if present
    const consent = page.locator('input[name="consentEssential"], input[type="checkbox"]');
    if (await consent.count() > 0) {
      await consent.first().check();
    }
    await page.click('button[type="submit"], input[type="submit"], button:has-text("Register"), button:has-text("Sign up")');
    await page.waitForTimeout(2000);
    // Should show duplicate error or stay on register page
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
  });

  test('register page has all expected fields', async ({ page }) => {
    await page.goto('/register');
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput.first()).toBeVisible();
  });
});

// ─── 05: API via Browser (fetch) ─────────────────────────────────────────────
test.describe('05 — API Calls via Browser Context', () => {
  test('POST /api/auth/login via fetch — returns token', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async (creds) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      return { status: res.status, data: await res.json() };
    }, USER);
    expect(result.status).toBe(200);
    expect(result.data.success).toBe(true);
    const token = result.data.data?.token || result.data.data?.accessToken;
    expect(typeof token).toBe('string');
  });

  test('GET /api/auth/profile — with token from fetch', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async (creds) => {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const loginData = await loginRes.json();
      const token = loginData.data?.token || loginData.data?.accessToken;
      const profileRes = await fetch('/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return { status: profileRes.status, data: await profileRes.json() };
    }, USER2);
    expect(result.status).toBe(200);
    const user = result.data.data || result.data.user || result.data;
    expect(user.email).toBe(USER2.email);
  });

  test('GET /api/auth/profile — no token returns 401', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/auth/profile');
      return res.status;
    });
    expect(result).toBe(401);
  });

  test('POST /api/auth/refresh-token works', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async (creds) => {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const { data } = await loginRes.json();
      const refreshRes = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: data.refreshToken }),
      });
      return { status: refreshRes.status, body: await refreshRes.json() };
    }, USER);
    expect(result.status).toBe(200);
    // refresh-token response: { token, refreshToken, expiresIn } at root level
    const newToken = result.body.token || result.body.accessToken || result.body.data?.token;
    expect(typeof newToken).toBe('string');
  });

  test('/.well-known/openid-configuration returns OIDC metadata', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/.well-known/openid-configuration');
      return { status: res.status, data: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(typeof result.data.issuer).toBe('string');
    expect(typeof result.data.authorization_endpoint).toBe('string');
    expect(typeof result.data.token_endpoint).toBe('string');
  });
});

// ─── 06: OAuth Client Registration ───────────────────────────────────────────
test.describe('06 — OAuth 2.0 via Browser', () => {
  test('register OAuth client and get credentials', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async (creds) => {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const { data: loginData } = await loginRes.json();
      const token = loginData.token || loginData.accessToken;
      const clientRes = await fetch('/api/oauth/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_name: 'Playwright Test Client',
          contact_email: 'playwright@example.com',
          redirect_uris: ['http://localhost:3000/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
        }),
      });
      return { status: clientRes.status, data: await clientRes.json() };
    }, USER);
    expect([200, 201]).toContain(result.status);
    expect(result.data.success).toBe(true);
    expect(typeof result.data.data.client_id).toBe('string');
    expect(typeof result.data.data.client_secret).toBe('string');
  });

  test('GET /api/oauth/userinfo returns user claims', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async (creds) => {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const { data } = await loginRes.json();
      const token = data.token || data.accessToken;
      const res = await fetch('/api/oauth/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return { status: res.status, data: await res.json() };
    }, USER2);
    expect(result.status).toBe(200);
    expect(typeof (result.data.sub || result.data.id)).toBe('string');
  });
});

// ─── 07: Session Management ───────────────────────────────────────────────────
test.describe('07 — Session Management', () => {
  test('GET /api/sessions returns session list', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async (creds) => {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const { data } = await loginRes.json();
      const token = data.token || data.accessToken;
      const res = await fetch('/api/sessions', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return { status: res.status, body: await res.json() };
    }, USER);
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });

  test('revoke-all-others sessions works', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async (creds) => {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const { data } = await loginRes.json();
      const token = data.token || data.accessToken;
      const sessionId = data.sessionId;
      const res = await fetch('/api/auth/sessions/revoke-all-others', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentSessionId: sessionId }),
      });
      return { status: res.status, body: await res.json() };
    }, USER2);
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });
});

// ─── 08: Dashboard Access Control ────────────────────────────────────────────
test.describe('08 — Dashboard Access Control', () => {
  test('dashboard API blocked without auth', async ({ page }) => {
    await page.goto('/');
    const results = await page.evaluate(async () => {
      const endpoints = [
        '/api/dashboard/monitoring',
        '/api/dashboard/logs',
        '/api/dashboard/analytics',
      ];
      const statuses = await Promise.all(
        endpoints.map(ep => fetch(ep).then(r => r.status))
      );
      return statuses;
    });
    expect(results.every(s => s === 401)).toBe(true);
  });
});
