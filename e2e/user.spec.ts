/**
 * user.spec.ts — User management, profile, PDPA export, delete account
 */
import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiPut, apiDelete, USER2, USER3 } from './helpers';

test.describe('10 — User — Profile & Settings', () => {
  test('GET /api/users/me returns user info', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/users/me', token);
    expect(r.status).toBe(200);
    const u = r.body.data || r.body.user || r.body;
    expect(u.email).toBe(USER2.email);
    expect(u.username).toBeTruthy();
    expect(u.role).toBeTruthy();
  });

  test('GET /api/users/profile returns own profile', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/users/profile', token);
    expect(r.status).toBe(200);
  });

  test('PUT /api/users/profile updates username', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiPut(page, '/api/users/profile', token, { username: 'k6user2' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  test('GET /api/users/me unauthenticated → 401', async ({ page }) => {
    await page.goto('/');
    const r = await apiGet(page, '/api/users/me', '');
    expect(r.status).toBe(401);
  });

  test('GET /api/users/sessions returns active sessions', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/users/sessions', token);
    expect(r.status).toBe(200);
  });
});

test.describe('11 — User — PDPA Rights', () => {
  test('GET /api/users/export returns user data (PDPA Art.27)', async ({ page }) => {
    await page.goto('/');
    const { token } = await apiLogin(page, USER2);
    const r = await apiGet(page, '/api/users/export', token);
    expect([200, 202]).toContain(r.status);
  });

  test('GET /api/users/export requires auth → 401 without token', async ({ page }) => {
    await page.goto('/');
    const r = await apiGet(page, '/api/users/export', '');
    expect(r.status).toBe(401);
  });

  test('DELETE /api/users/account requires auth (PDPA Art.33)', async ({ page }) => {
    await page.goto('/');
    const r = await apiDelete(page, '/api/users/account', '');
    expect(r.status).toBe(401);
  });
});
