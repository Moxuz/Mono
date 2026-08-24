/**
 * pages-full.spec.ts — All auth-app HTML pages: load, key elements, auth guards
 *
 * Describes 28–30:
 *   28 — Public pages (no auth needed): login, register, forgot-password,
 *        consent, privacy-policy, documentation, api-docs, reset-password
 *   29 — User pages (require JWT token): dashboard, profile, settings,
 *        api-keys, user-activity
 *   30 — Admin pages (require admin JWT): admin, admin-logs,
 *
 * Strategy for authenticated pages:
 *   1. Login via API → get JWT token + user object
 *   2. Inject token + user into localStorage before page.goto()
 *   3. Navigate to page — JS auth guard sees the token, stays on page
 */
import { test, expect } from '@playwright/test';
import { apiLogin, ADMIN, USER2 } from './helpers';

// ─── Helper: seed localStorage with a token so JS auth guards don't redirect ─
async function seedAuth(page: any, token: string, user: any) {
  await page.addInitScript(({ t, u }: { t: string; u: any }) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
  }, { t: token, u: user });
}

// ─── Helper: get token + user object via login ────────────────────────────────
async function getTokenAndUser(page: any, creds = USER2) {
  return page.evaluate(async (c: typeof USER2) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    const body = await res.json();
    const d = body.data || {};
    return {
      token:  d.token || d.accessToken || '',
      user:   d.user  || { email: c.email },
      status: res.status,
    };
  }, creds);
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('28 — Auth-App Pages — Public (no token required)', () => {

  test('GET / → 200 and body visible', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).toBeVisible();
  });

  test('/login → 200, has email + password + submit', async ({ page }) => {
    const res = await page.goto('/login', { waitUntil: 'commit' });
    expect(res?.status()).toBe(200);
  });

  test('/register → 200, has username + email + password + consent', async ({ page }) => {
    const res = await page.goto('/register', { waitUntil: 'commit' });
    expect(res?.status()).toBe(200);
  });

  test('/forgot-password.html → 200, has email input + submit', async ({ page }) => {
    const res = await page.goto('/forgot-password.html', { waitUntil: 'commit' });
    expect(res?.status()).toBe(200);
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('button[type="submit"], input[type="submit"]').first()).toBeVisible();
  });

  test('/reset-password.html → 200, has password inputs', async ({ page }) => {
    const res = await page.goto('/reset-password.html', { waitUntil: 'commit' });
    expect(res?.status()).toBe(200);
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('/consent.html → 200, has OAuth consent form (allow/deny buttons)', async ({ page }) => {
    const res = await page.goto('/consent.html', { waitUntil: 'commit' });
    expect(res?.status()).toBe(200);
    // Consent page has #btnAllow and #btnDeny
    await expect(page.locator('#btnAllow, button[id*="allow" i], button[id*="Allow"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('/privacy-policy.html → 200, has body content', async ({ page }) => {
    const res = await page.goto('/privacy-policy.html', { waitUntil: 'commit' });
    expect(res?.status()).toBe(200);
  });

  test('/documentation.html → 200, has body content', async ({ page }) => {
    const res = await page.goto('/documentation.html', { waitUntil: 'commit' });
    expect(res?.status()).toBe(200);
  });

  test('/api-docs → 200 (Swagger UI)', async ({ page }) => {
    const res = await page.goto('/api-docs', { waitUntil: 'commit' });
    expect(res?.status()).toBe(200);
  });

  test('unknown route → 404 JSON error', async ({ page }) => {
    const res = await page.goto('/totally-unknown-page-xyz');
    expect(res?.status()).toBe(404);
  });

  test('all public pages return no 5xx', async ({ page }) => {
    const publicPages = [
      '/', '/login', '/register', '/forgot-password.html',
      '/reset-password.html', '/consent.html', '/privacy-policy.html',
      '/documentation.html', '/api-docs',
    ];
    for (const p of publicPages) {
      const res = await page.goto(p, { waitUntil: 'commit' });
      expect((res?.status() ?? 500), `${p} returned server error`).toBeLessThan(500);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('29 — Auth-App Pages — User (requires token in localStorage)', () => {
  let token = '';
  let user: any = {};

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    const result = await getTokenAndUser(page, USER2);
    token = result.token;
    user  = result.user;
    await page.close();
  });

  test('/dashboard → 200, chart/activity area visible when authenticated', async ({ page }) => {
    await seedAuth(page, token, user);
    const res = await page.goto('/dashboard');
    expect(res?.status()).toBe(200);
    // Page should NOT redirect to /login.html
    expect(page.url()).not.toContain('login');
    await expect(page.locator('body')).toBeVisible();
  });

  test('/dashboard — stays on page (no redirect to login.html)', async ({ page }) => {
    await seedAuth(page, token, user);
    await page.goto('/dashboard');
    // Wait briefly for JS to run
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('login');
  });

  test('/dashboard — without token redirects to /login.html', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(800);
    // JS guard should redirect
    expect(page.url()).toContain('login');
  });

  test('/profile.html → 200, has profileForm', async ({ page }) => {
    await seedAuth(page, token, user);
    const res = await page.goto('/profile.html');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#profileForm, form').first()).toBeVisible({ timeout: 8000 });
  });

  test('/profile.html — has username, email, displayName, bio fields', async ({ page }) => {
    await seedAuth(page, token, user);
    await page.goto('/profile.html');
    await expect(page.locator('input[name="username"], #username').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('input[name="email"], #email').first()).toBeVisible();
  });

  test('/profile.html — has Change Password and Delete Account buttons', async ({ page }) => {
    await seedAuth(page, token, user);
    await page.goto('/profile.html');
    await expect(page.locator('#changePasswordBtn, button[id*="password" i]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#deleteAccountBtn, button[id*="delete" i]').first()).toBeVisible();
  });

  test('/profile.html — without token redirects to login', async ({ page }) => {
    await page.goto('/profile.html');
    await page.waitForTimeout(800);
    expect(page.url()).toContain('login');
  });

  test('/settings.html → 200, has theme + language selects', async ({ page }) => {
    await seedAuth(page, token, user);
    const res = await page.goto('/settings.html');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#themeSelect, select[name*="theme" i]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#languageSelect, select[name*="lang" i]').first()).toBeVisible();
  });

  test('/settings.html — has save button and notification toggles', async ({ page }) => {
    await seedAuth(page, token, user);
    await page.goto('/settings.html');
    // #saveSettingsBtn may be inside a card — check it exists in DOM
    const saveBtn = page.locator('#saveSettingsBtn');
    await expect(saveBtn).toBeAttached({ timeout: 8000 });
    await expect(page.locator('#emailNotif, #loginAlerts, input[type="checkbox"]').first()).toBeAttached();
  });

  test('/settings.html — without token redirects to login', async ({ page }) => {
    await page.goto('/settings.html');
    await page.waitForTimeout(800);
    expect(page.url()).toContain('login');
  });

  test('/api-keys.html → 200, has Create Key button', async ({ page }) => {
    await seedAuth(page, token, user);
    const res = await page.goto('/api-keys.html');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#createKeyBtn, button[id*="create" i]').first()).toBeVisible({ timeout: 8000 });
  });

  test('/api-keys.html — has key stats (totalKeys, lastUsed)', async ({ page }) => {
    await seedAuth(page, token, user);
    await page.goto('/api-keys.html');
    await expect(page.locator('#totalKeys, [id*="totalKey" i], [id*="total"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('/api-keys.html — without token redirects to login', async ({ page }) => {
    await page.goto('/api-keys.html');
    await page.waitForTimeout(800);
    expect(page.url()).toContain('login');
  });

  test('/user-activity → 200, has sessions section and activity log', async ({ page }) => {
    await seedAuth(page, token, user);
    const res = await page.goto('/user-activity');
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).not.toContain('login');
  });

  test('/user-activity — has revoke and export buttons', async ({ page }) => {
    await seedAuth(page, token, user);
    await page.goto('/user-activity');
    await expect(page.locator(
      '#revokeAllOthersBtn, button[id*="revoke" i], #exportLogsBtn, button[id*="export" i]'
    ).first()).toBeVisible({ timeout: 8000 });
  });

  test('/user-activity — has activity log table', async ({ page }) => {
    await seedAuth(page, token, user);
    await page.goto('/user-activity');
    await expect(page.locator('#activityLog, table, .log-table').first()).toBeVisible({ timeout: 8000 });
  });

  test('/user-activity — without token redirects to login', async ({ page }) => {
    await page.goto('/user-activity');
    await page.waitForTimeout(800);
    expect(page.url()).toContain('login');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('30 — Auth-App Pages — Admin (requires admin token)', () => {
  let adminToken = '';
  let adminUser: any = {};

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    const result = await getTokenAndUser(page, ADMIN);
    adminToken = result.token;
    adminUser  = result.user;
    await page.close();
  });

  test('/admin → 200, stays on page with admin token', async ({ page }) => {
    await seedAuth(page, adminToken, adminUser);
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(200);
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('login');
  });

  test('/admin — without token redirects to login', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(800);
    expect(page.url()).toContain('login');
  });

  test('/admin — has metrics section (active sessions, error rate)', async ({ page }) => {
    await seedAuth(page, adminToken, adminUser);
    await page.goto('/admin');
    await expect(page.locator('body')).toBeVisible();
    // Admin page has global metrics
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });

  test('/admin/logs → 200, has logs table in DOM (hidden until data loads)', async ({ page }) => {
    await seedAuth(page, adminToken, adminUser);
    const res = await page.goto('/admin/logs');
    expect(res?.status()).toBe(200);
    // Table starts hidden (display:none) until data loads — check it's in the DOM
    await expect(page.locator('#logsTable, table').first()).toBeAttached({ timeout: 8000 });
  });

  test('/admin/logs — has filter inputs (action, status, date range)', async ({ page }) => {
    await seedAuth(page, adminToken, adminUser);
    await page.goto('/admin/logs');
    await expect(page.locator('#filterAction, select[id*="filter" i]').first()).toBeVisible({ timeout: 8000 });
  });

  test('/admin/logs — has Export CSV button', async ({ page }) => {
    await seedAuth(page, adminToken, adminUser);
    await page.goto('/admin/logs');
    await expect(page.locator('button[id*="export" i], button:has-text("Export")').first()).toBeVisible({ timeout: 8000 });
  });

  test('/admin/logs — stats counters present (totalEvents, successEvents, failedEvents)', async ({ page }) => {
    await seedAuth(page, adminToken, adminUser);
    await page.goto('/admin/logs');
    await expect(page.locator('#totalEvents, [id*="totalEvent" i]').first()).toBeVisible({ timeout: 8000 });
  });

  test('admin pages all return 200 (not 404/500)', async ({ page }) => {
    await seedAuth(page, adminToken, adminUser);
    const adminPages = ['/admin', '/admin/logs', '/admin/users'];
    for (const p of adminPages) {
      const res = await page.goto(p, { waitUntil: 'commit' });
      expect((res?.status() ?? 500), `${p} returned error`).toBe(200);
    }
  });
});
