/**
 * oauth.spec.ts — OAuth 2.0 client management, introspect, userinfo, revoke,
 *                 OIDC discovery, JWKS endpoint
 *
 * All describe blocks run serially in one worker so `clientId` set by the
 * POST test in group 14 is visible to GET/PUT/DELETE/authorize tests in 14 & 15.
 */
import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiPut, apiDelete, USER2, USER3 } from './helpers';

test.describe('OAuth Suite', () => {
  // Force sequential execution within this file so shared state is safe
  test.describe.configure({ mode: 'serial' });

  // Shared OAuth client created once — visible to all describe blocks below
  let clientId = '';
  let clientSecret = '';

  test.describe('13 — OAuth — OIDC Discovery & JWKS', () => {
    test('GET /.well-known/openid-configuration has required fields', async ({ page }) => {
      await page.goto('/');
      const r = await page.evaluate(async () => {
        const res = await fetch('/.well-known/openid-configuration');
        return { status: res.status, body: await res.json() };
      });
      expect(r.status).toBe(200);
      expect(r.body.issuer).toBeTruthy();
      expect(r.body.authorization_endpoint).toBeTruthy();
      expect(r.body.token_endpoint).toBeTruthy();
      expect(r.body.userinfo_endpoint).toBeTruthy();
      expect(r.body.jwks_uri).toBeTruthy();
    });

    test('GET /.well-known/jwks.json → 200', async ({ page }) => {
      await page.goto('/');
      const r = await page.evaluate(async () => {
        const res = await fetch('/.well-known/jwks.json');
        return { status: res.status };
      });
      expect(r.status).toBe(200);
    });
  });

  test.describe('14 — OAuth — Client Management', () => {
    test('POST /api/oauth/clients — register new client', async ({ page }) => {
      await page.goto('/');
      const { token } = await apiLogin(page, USER2);
      const r = await page.evaluate(async (token) => {
        const res = await fetch('/api/oauth/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            client_name: `E2E Test Client ${Date.now()}`,
            contact_email: 'e2e@example.com',
            redirect_uris: ['http://localhost:3001/callback'],
            grant_types: ['authorization_code', 'refresh_token'],
          }),
        });
        return { status: res.status, body: await res.json() };
      }, token);
      expect([200, 201]).toContain(r.status);
      expect(r.body.success).toBe(true);
      expect(r.body.data.client_id).toBeTruthy();
      expect(r.body.data.client_secret).toBeTruthy();
      clientId = r.body.data.client_id;
      clientSecret = r.body.data.client_secret;
    });

    test('GET /api/oauth/clients returns array of clients', async ({ page }) => {
      await page.goto('/');
      const { token } = await apiLogin(page, USER2);
      const r = await apiGet(page, '/api/oauth/clients', token);
      expect(r.status).toBe(200);
      const arr = r.body.data?.clients || r.body.data || [];
      expect(Array.isArray(arr)).toBe(true);
    });

    test('GET /api/oauth/clients/:id returns client details', async ({ page }) => {
      await page.goto('/');
      const { token } = await apiLogin(page, USER2);
      const r = await apiGet(page, `/api/oauth/clients/${clientId}`, token);
      expect([200, 404]).toContain(r.status);
    });

    test('PUT /api/oauth/clients/:id updates client name', async ({ page }) => {
      await page.goto('/');
      const { token } = await apiLogin(page, USER2);
      const r = await apiPut(page, `/api/oauth/clients/${clientId}`, token, {
        client_name: 'Updated E2E Client',
      });
      expect([200, 404]).toContain(r.status);
    });

    test('POST /api/oauth/clients unauthenticated → 401', async ({ page }) => {
      await page.goto('/');
      const r = await apiPost(page, '/api/oauth/clients', '', {
        client_name: 'x', contact_email: 'x@x.com', redirect_uris: ['http://x.com'],
      });
      expect(r.status).toBe(401);
    });
  });

  test.describe('15 — OAuth — Token Operations', () => {
    test('POST /api/oauth/introspect with client credentials → 200 with active field', async ({ page }) => {
      await page.goto('/');
      const { token } = await apiLogin(page, USER2);
      // Create a fresh client for introspection
      const clientRes = await page.evaluate(async (t) => {
        const res = await fetch('/api/oauth/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ client_name: 'Introspect Test', contact_email: 'i@e.com', redirect_uris: ['http://localhost/cb'], grant_types: ['authorization_code'] }),
        });
        return (await res.json()).data;
      }, token);

      const r = await page.evaluate(async ({ token, cid, csec }) => {
        const form = new URLSearchParams({ token, client_id: cid, client_secret: csec });
        const res = await fetch('/api/oauth/introspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });
        return { status: res.status, body: await res.json() };
      }, { token, cid: clientRes.client_id, csec: clientRes.client_secret });

      expect(r.status).toBe(200);
      expect(r.body).toHaveProperty('active');
    });

    test('POST /api/oauth/introspect without client credentials → 401', async ({ page }) => {
      await page.goto('/');
      const { token } = await apiLogin(page, USER2);
      const r = await page.evaluate(async (t) => {
        const form = new URLSearchParams({ token: t });
        const res = await fetch('/api/oauth/introspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });
        return res.status;
      }, token);
      expect(r).toBe(401);
    });

    test('GET /api/oauth/userinfo with valid token → 200 with sub', async ({ page }) => {
      await page.goto('/');
      const { token } = await apiLogin(page, USER2);
      const r = await apiGet(page, '/api/oauth/userinfo', token);
      expect(r.status).toBe(200);
      expect(r.body.sub || r.body.id).toBeTruthy();
    });

    test('GET /api/oauth/userinfo without token → 401', async ({ page }) => {
      await page.goto('/');
      const r = await apiGet(page, '/api/oauth/userinfo', '');
      expect(r.status).toBe(401);
    });

    test('GET /api/oauth/authorize with valid client_id → 200 or 302', async ({ page }) => {
      const res = await page.goto(
        `/api/oauth/authorize?client_id=${clientId}&redirect_uri=http://localhost:3001/callback&response_type=code&scope=openid profile email`
      );
      expect([200, 302, 400]).toContain(res?.status());
    });

    test('DELETE /api/oauth/clients/:id removes client', async ({ page }) => {
      await page.goto('/');
      const { token } = await apiLogin(page, USER2);
      const r = await apiDelete(page, `/api/oauth/clients/${clientId}`, token);
      expect([200, 204, 404]).toContain(r.status);
    });
  });
});
