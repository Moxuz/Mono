/**
 * capture-screenshots.js
 * Visits every page described in TAS8-final.docx (groups 28-30)
 * and saves full-page screenshots to Final-Final/picture/screenshots/
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost';
const OUT  = path.join(__dirname, 'Final-Final', 'picture', 'screenshots');

// ── Pages to capture ──────────────────────────────────────────────────────────
const PUBLIC_PAGES = [
  { url: '/',                    name: '01-home' },
  { url: '/login',               name: '02-login' },
  { url: '/register',            name: '03-register' },
  { url: '/forgot-password.html', name: '04-forgot-password' },
  { url: '/reset-password.html', name: '05-reset-password' },
  { url: '/consent.html',        name: '06-consent' },
  { url: '/privacy-policy.html', name: '07-privacy-policy' },
  { url: '/documentation.html',  name: '08-documentation' },
  { url: '/api-docs',            name: '09-api-docs' },
];

const AUTH_PAGES = [
  { url: '/dashboard',           name: '10-dashboard' },
  { url: '/profile.html',        name: '11-profile' },
  { url: '/settings.html',       name: '12-settings' },
  { url: '/api-keys.html',       name: '13-api-keys' },
  { url: '/user-activity.html',  name: '14-user-activity' },
];

const ADMIN_PAGES = [
  { url: '/admin',               name: '15-admin' },
  { url: '/admin-logs.html',     name: '16-admin-logs' },
];

const CREDS = {
  user:  { email: 'k6user2@example.com', password: 'K6Test99!' },
  admin: { email: 'k6user1@example.com', password: 'K6Test99!' },
};

async function login(page, creds) {
  const res = await page.evaluate(async (c) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    return r.json();
  }, creds);
  return res?.data || null;
}

async function seedAuth(page, token, user) {
  await page.addInitScript(({ t, u }) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
  }, { t: token, u: user });
}

async function capture(page, url, name) {
  try {
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({
      path: path.join(OUT, `${name}.png`),
      fullPage: true,
    });
    console.log(`  ✔ ${name}.png`);
  } catch (e) {
    console.log(`  ✖ ${name} — ${e.message.split('\n')[0]}`);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ── 1. Public pages ─────────────────────────────────────────────────────────
  console.log('\n[Group 28] Public pages');
  const pub = await browser.newPage();
  for (const p of PUBLIC_PAGES) await capture(pub, p.url, p.name);
  await pub.close();

  // ── 2. Authenticated user pages ─────────────────────────────────────────────
  console.log('\n[Group 29] User pages (JWT auth)');
  const userPage = await browser.newPage();
  // login first to get token
  await userPage.goto(BASE + '/login', { waitUntil: 'commit' });
  const userData = await login(userPage, CREDS.user);
  if (userData?.token) {
    for (const p of AUTH_PAGES) {
      const pg = await browser.newPage();
      await seedAuth(pg, userData.token, userData.user);
      await capture(pg, p.url, p.name);
      await pg.close();
    }
  } else {
    console.log('  ⚠ Could not get user token — skipping auth pages');
  }
  await userPage.close();

  // ── 3. Admin pages ───────────────────────────────────────────────────────────
  console.log('\n[Group 30] Admin pages (admin JWT)');
  const adminPage = await browser.newPage();
  await adminPage.goto(BASE + '/login', { waitUntil: 'commit' });
  const adminData = await login(adminPage, CREDS.admin);
  if (adminData?.token) {
    for (const p of ADMIN_PAGES) {
      const pg = await browser.newPage();
      await seedAuth(pg, adminData.token, adminData.user);
      await capture(pg, p.url, p.name);
      await pg.close();
    }
  } else {
    console.log('  ⚠ Could not get admin token — skipping admin pages');
  }
  await adminPage.close();

  await browser.close();
  console.log(`\nDone — screenshots saved to:\n  ${OUT}\n`);
})();
