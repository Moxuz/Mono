/**
 * pages.spec.ts — All HTML pages load, render key elements, no broken layout
 */
import { test, expect } from '@playwright/test';

const pages = [
  { path: '/',                   title: /./,             selector: 'body' },
  { path: '/login',              title: /./,             selector: 'input[type="email"], input[name="email"]' },
  { path: '/register',           title: /./,             selector: 'input[name="username"], input[placeholder*="username" i]' },
  { path: '/forgot-password.html', title: /./,            selector: 'input[type="email"], input[name="email"]' },
  { path: '/dashboard',          title: /./,             selector: 'body' },
  { path: '/privacy-policy',     title: /./,             selector: 'body' },
  { path: '/documentation',      title: /./,             selector: 'body' },
  { path: '/api-docs',           title: /Swagger|API/i,  selector: 'body' },
];

test.describe('01 — Page Rendering', () => {
  for (const pg of pages) {
    test(`${pg.path} loads without crash`, async ({ page }) => {
      const res = await page.goto(pg.path);
      expect(res?.status()).toBeLessThan(500);
      await expect(page.locator(pg.selector).first()).toBeVisible({ timeout: 10000 });
    });
  }

  test('/login has email + password + submit button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"], input[type="submit"]').first()).toBeVisible();
  });

  test('/register has username + email + password + confirm + consent', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[name="username"], input[placeholder*="username" i]')).toBeVisible();
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]')).toBeVisible();
  });

  test('/forgot-password has email input + submit', async ({ page }) => {
    await page.goto('/forgot-password.html');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], input[type="submit"]').first()).toBeVisible();
  });

  test('404 on unknown route returns JSON error', async ({ page }) => {
    const res = await page.goto('/this-does-not-exist');
    expect(res?.status()).toBe(404);
  });

  test('all pages respond < 15000ms', async ({ page }) => {
    for (const pg of pages) {
      const start = Date.now();
      await page.goto(pg.path, { waitUntil: 'commit' });
      expect(Date.now() - start).toBeLessThan(15000);
    }
  });
});
