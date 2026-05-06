import { Page, APIRequestContext } from '@playwright/test';

export const AUTH_URL  = 'http://localhost';
export const CLIENT_URL = 'http://localhost:3001';

export const ADMIN  = { email: 'k6user1@example.com', password: 'K6Test99!' };
export const USER2  = { email: 'k6user2@example.com', password: 'K6Test99!' };
export const USER3  = { email: 'k6user3@example.com', password: 'K6Test99!' };

/** Login via API and return { token, refreshToken, sessionId, userId } */
export async function apiLogin(page: Page, creds = USER2) {
  return page.evaluate(async (c) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    const body = await res.json();
    const d = body.data || {};
    return {
      token:        d.token || d.accessToken || '',
      refreshToken: d.refreshToken || '',
      sessionId:    d.sessionId || '',
      userId:       d.user?.id || '',
      status:       res.status,
    };
  }, creds);
}

/** Authenticated GET, returns { status, body } */
export async function apiGet(page: Page, path: string, token: string) {
  return page.evaluate(async ({ path, token }) => {
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { path, token });
}

/** Authenticated POST, returns { status, body } */
export async function apiPost(page: Page, path: string, token: string, data: object) {
  return page.evaluate(async ({ path, token, data }) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { path, token, data });
}

/** Authenticated PUT */
export async function apiPut(page: Page, path: string, token: string, data: object) {
  return page.evaluate(async ({ path, token, data }) => {
    const res = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { path, token, data });
}

/** Authenticated DELETE */
export async function apiDelete(page: Page, path: string, token: string) {
  return page.evaluate(async ({ path, token }) => {
    const res = await fetch(path, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { path, token });
}
