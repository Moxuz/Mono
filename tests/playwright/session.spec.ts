/**
 * session.spec.ts — Session management (list, revoke, count)
 */
import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiDelete, USER2, USER3 } from './helpers';

test.describe('12 — Sessions', () => {
  test('GET /api/sessions returns session list', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/sessions', token);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeTruthy();
  });

  test('GET /api/sessions unauthenticated → 401', async ({ page }) => {
    await page.goto('/');
    const r = await apiGet(page, '/api/sessions', '');
    expect(r.status).toBe(401);
  });

  test('GET /api/auth/sessions returns sessions list with count', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/auth/sessions', token);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  test('POST /api/auth/sessions/revoke-all-others → 200', async ({ page }) => {
    await page.goto('/');
    const { token, sessionId } = await apiLogin(page, USER3);
    const r = await apiPost(page, '/api/auth/sessions/revoke-all-others', token, {
      currentSessionId: sessionId,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  test('GET /api/dashboard/user/sessions returns sessions', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/dashboard/user/sessions', token);
    expect(r.status).toBe(200);
  });

  test('GET /api/dashboard/user/security-summary → 200', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/dashboard/user/security-summary', token);
    expect(r.status).toBe(200);
  });

  test('GET /api/dashboard/user/activity → 200', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/dashboard/user/activity', token);
    expect(r.status).toBe(200);
  });

  test('GET /api/dashboard/user/login-history → 200', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/dashboard/user/login-history', token);
    expect(r.status).toBe(200);
  });

  test('POST /api/auth/sessions/revoke-all-others revokes sessions → 200', async ({ page }) => {
    await page.goto('/');
    const { token, sessionId } = await apiLogin(page, USER3);
    const r = await apiPost(page, '/api/auth/sessions/revoke-all-others', token, {
      currentSessionId: sessionId,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});
