#!/usr/bin/env node
'use strict';

const crypto = require('crypto');

const BASE_URL = new URL(
    process.env.LIVE_AUDIT_BASE_URL || 'https://testmono-user.duckdns.org'
);
const RUN_MARKER = `v23audit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const REDIRECT_URI = 'https://audit-v23.invalid/callback';
const REDIRECT_URI_2 = 'https://audit-v23-2.invalid/callback';
const ORIGIN = BASE_URL.origin;

let passed = 0;

class CookieJar {
    constructor() {
        this.cookies = new Map();
        this.lastSetCookies = [];
    }

    capture(response) {
        const setCookies = typeof response.headers.getSetCookie === 'function'
            ? response.headers.getSetCookie()
            : [response.headers.get('set-cookie')].filter(Boolean);
        this.lastSetCookies = setCookies;

        for (const line of setCookies) {
            const [pair] = line.split(';', 1);
            const separator = pair.indexOf('=');
            if (separator < 1) continue;
            const name = pair.slice(0, separator).trim();
            const value = pair.slice(separator + 1);
            if (!value || /(?:^|;)\s*max-age=0(?:;|$)/i.test(line)) {
                this.cookies.delete(name);
            } else {
                this.cookies.set(name, value);
            }
        }
    }

    header() {
        return [...this.cookies.entries()]
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }
}

function check(name, condition) {
    if (!condition) throw new Error(`Check failed: ${name}`);
    passed += 1;
    console.log(`PASS ${name}`);
}

function safeBody(body) {
    if (body === null || body === undefined) return body;
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return text
        .replace(/("(?:client_secret|access_token|refresh_token|id_token|token|code)"\s*:\s*")[^"]+/gi, '$1[redacted]')
        .slice(0, 500);
}

async function request(pathOrUrl, {
    method = 'GET',
    jar = null,
    body,
    headers = {},
    expected = [200],
    redirect = 'manual'
} = {}) {
    const url = new URL(pathOrUrl, BASE_URL);
    const requestHeaders = new Headers({
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'User-Agent': 'AuthSys-v23-live-audit',
        ...headers
    });

    if (jar?.header()) requestHeaders.set('Cookie', jar.header());

    let requestBody;
    if (body !== undefined) {
        if (body instanceof URLSearchParams || typeof body === 'string') {
            requestBody = body;
        } else {
            requestHeaders.set('Content-Type', 'application/json');
            requestBody = JSON.stringify(body);
        }
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && url.origin === ORIGIN) {
        if (!requestHeaders.has('Origin')) requestHeaders.set('Origin', ORIGIN);
        if (!requestHeaders.has('Referer')) requestHeaders.set('Referer', `${ORIGIN}/`);
    }

    const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
        redirect
    });
    if (jar) jar.capture(response);

    const text = await response.text();
    let parsed = text;
    if ((response.headers.get('content-type') || '').includes('application/json') && text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }

    if (!expected.includes(response.status)) {
        throw new Error(
            `${method} ${url.pathname} returned ${response.status}; expected ${expected.join('/')} body=${safeBody(parsed)}`
        );
    }

    return {
        response,
        body: parsed,
        location: response.headers.get('location')
    };
}

function randomPassword() {
    const sequential = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (;;) {
        const candidate = `V!9q${crypto.randomBytes(18).toString('base64url')}Z`;
        const lower = candidate.toLowerCase();
        let bad = /(.)\1{3,}/.test(candidate);
        for (let i = 0; i <= sequential.length - 3 && !bad; i += 1) {
            const part = sequential.slice(i, i + 3);
            const reverse = [...part].reverse().join('');
            bad = lower.includes(part) || lower.includes(reverse);
        }
        if (!bad) return candidate;
    }
}

function pkce() {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

function oauthParams(clientId, verifierData, state, nonce, prompt) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid profile email offline_access',
        state,
        nonce,
        code_challenge: verifierData.challenge,
        code_challenge_method: 'S256'
    });
    if (prompt) params.set('prompt', prompt);
    return params;
}

function basicAuth(clientId, clientSecret) {
    return 'Basic ' + Buffer
        .from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`)
        .toString('base64');
}

function decodeJwt(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('JWT must contain three segments');
    return {
        encodedHeader: parts[0],
        encodedPayload: parts[1],
        signature: parts[2],
        header: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
        payload: JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    };
}

async function verifyIdToken(idToken, expected) {
    const discovery = (await request('/.well-known/openid-configuration')).body;
    const jwks = (await request(discovery.jwks_uri)).body;
    const decoded = decodeJwt(idToken);
    const jwk = jwks.keys.find((candidate) => candidate.kid === decoded.header.kid);

    check('discovery advertises authorization code + PKCE S256',
        discovery.response_types_supported.includes('code') &&
        discovery.code_challenge_methods_supported.includes('S256'));
    check('ID token advertises and uses RS256', decoded.header.alg === 'RS256' && Boolean(jwk));

    const validSignature = crypto.verify(
        'RSA-SHA256',
        Buffer.from(`${decoded.encodedHeader}.${decoded.encodedPayload}`),
        crypto.createPublicKey({ key: jwk, format: 'jwk' }),
        Buffer.from(decoded.signature, 'base64url')
    );
    check('ID token signature verifies against JWKS', validSignature);
    check('ID token issuer/audience/nonce/sub claims bind to the flow',
        decoded.payload.iss === ORIGIN &&
        decoded.payload.aud === expected.clientId &&
        decoded.payload.nonce === expected.nonce &&
        decoded.payload.sub === expected.userId &&
        typeof decoded.payload.iat === 'number' &&
        decoded.payload.exp > Math.floor(Date.now() / 1000));
    return decoded.payload;
}

function containsForbiddenKey(value) {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(containsForbiddenKey);
    const forbidden = new Set([
        'password',
        'client_secret',
        'accessTokenHash',
        'refreshTokenHash',
        'passwordResetToken'
    ]);
    return Object.entries(value).some(([key, nested]) =>
        forbidden.has(key) || containsForbiddenKey(nested)
    );
}

async function waitForAdmin(jar, username) {
    console.log(`ADMIN_PROMOTION_TARGET=${username}`);
    for (let attempt = 1; attempt <= 60; attempt += 1) {
        const result = await request('/api/dashboard/', {
            jar,
            expected: [200, 403]
        });
        if (result.response.status === 200) return result;
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('Timed out waiting for isolated audit user promotion');
}

async function run() {
    console.log(`LIVE_AUDIT_MARKER=${RUN_MARKER}`);

    const userA = {
        username: `${RUN_MARKER}_a`,
        email: `${RUN_MARKER}.a@example.test`,
        password: randomPassword(),
        jar: new CookieJar(),
        registered: false,
        deleted: false
    };
    const userB = {
        username: `${RUN_MARKER}_b`,
        email: `${RUN_MARKER}.b@example.test`,
        password: randomPassword(),
        jar: new CookieJar(),
        registered: false,
        deleted: false
    };

    try {
        const unauthPrivate = await request('/dashboard.html', { expected: [302] });
        check('private page redirects an anonymous browser to login',
            unauthPrivate.location?.startsWith('/login.html?returnTo='));

        const crossOrigin = await request('/api/auth/register', {
            method: 'POST',
            headers: { Origin: 'https://cross-origin.invalid' },
            body: {
                username: `${RUN_MARKER}_blocked`,
                email: `${RUN_MARKER}.blocked@example.test`,
                password: randomPassword(),
                consentEssential: true,
                consentAnalytics: false
            },
            expected: [403]
        });
        check('cross-origin registration is rejected before account creation',
            crossOrigin.body?.error === 'Cross-origin authentication request blocked');

        for (const user of [userA, userB]) {
            const registered = await request('/api/auth/register', {
                method: 'POST',
                jar: user.jar,
                body: {
                    username: user.username,
                    email: user.email,
                    password: user.password,
                    consentEssential: true,
                    consentAnalytics: false
                },
                expected: [201]
            });
            user.registered = true;
            user.id = String(registered.body?.data?.user?.id || '');
            check(`register creates authenticated session for ${user === userA ? 'user A' : 'user B'}`,
                registered.body?.success === true && user.id.length === 24 && user.jar.header().includes('connect.sid='));
        }

        await request('/api/auth/logout', {
            method: 'POST',
            jar: userA.jar,
            body: {},
            expected: [200]
        });
        const loggedOut = await request('/api/auth/session', { jar: userA.jar });
        check('logout destroys the first-party browser session', loggedOut.body?.authenticated === false);

        const remembered = await request('/api/auth/login', {
            method: 'POST',
            jar: userA.jar,
            body: { email: userA.email, password: userA.password, remember: true }
        });
        check('remember-me login returns only browser-safe auth data',
            remembered.body?.data?.authenticated === true &&
            !containsForbiddenKey(remembered.body));
        check('remember-me issues a persistent HttpOnly Secure session cookie',
            userA.jar.lastSetCookies.some((line) =>
                /connect\.sid=/i.test(line) &&
                /httponly/i.test(line) &&
                /secure/i.test(line) &&
                (/(?:max-age|expires)=/i.test(line))
            ));

        const sessionA = await request('/api/auth/session', { jar: userA.jar });
        check('remembered session avoids a second login',
            sessionA.body?.authenticated === true && sessionA.body?.user?.id === userA.id);

        const dashboardPage = await request('/dashboard.html', { jar: userA.jar });
        check('authenticated private page is no-store HTML',
            dashboardPage.response.headers.get('cache-control')?.includes('no-store'));
        await request('/admin.html', { jar: userA.jar, expected: [403] });
        await request('/api/users?limit=2', { jar: userB.jar, expected: [403] });
        check('normal users cannot access admin page or user directory', true);

        const invalidClient = await request('/api/oauth/clients', {
            method: 'POST',
            jar: userA.jar,
            body: {
                client_name: `${RUN_MARKER} invalid`,
                contact_email: userA.email,
                redirect_uris: ['http://audit-v23.invalid/callback'],
                application_type: 'web',
                scope: 'openid profile email'
            },
            expected: [400]
        });
        check('production rejects non-HTTPS redirect URIs',
            String(invalidClient.body?.error || '').includes('HTTPS'));

        const clientResult = await request('/api/oauth/clients', {
            method: 'POST',
            jar: userA.jar,
            body: {
                client_name: `${RUN_MARKER} client A`,
                description: 'Isolated v23 live-audit client',
                contact_email: userA.email,
                redirect_uris: [REDIRECT_URI],
                application_type: 'web',
                scope: 'openid profile email offline_access'
            },
            expected: [201]
        });
        const clientA = {
            id: clientResult.body?.data?.client_id,
            secret: clientResult.body?.data?.client_secret
        };
        check('client registration returns one-time confidential credentials',
            /^[a-f0-9]{32}$/.test(clientA.id || '') && /^[a-f0-9]{64}$/.test(clientA.secret || ''));

        const clientResultB = await request('/api/oauth/clients', {
            method: 'POST',
            jar: userB.jar,
            body: {
                client_name: `${RUN_MARKER} client B`,
                contact_email: userB.email,
                redirect_uris: [REDIRECT_URI_2],
                application_type: 'web',
                scope: 'openid profile email'
            },
            expected: [201]
        });
        const clientB = {
            id: clientResultB.body?.data?.client_id,
            secret: clientResultB.body?.data?.client_secret
        };

        const listA = await request('/api/oauth/clients', { jar: userA.jar });
        const listB = await request('/api/oauth/clients', { jar: userB.jar });
        const idsA = listA.body?.data?.clients?.map((client) => client.client_id) || [];
        const idsB = listB.body?.data?.clients?.map((client) => client.client_id) || [];
        check('developer portal lists only clients owned by the current user',
            idsA.includes(clientA.id) && !idsA.includes(clientB.id) &&
            idsB.includes(clientB.id) && !idsB.includes(clientA.id) &&
            !JSON.stringify(listA.body).includes(clientA.secret));

        await request(`/api/oauth/clients/${encodeURIComponent(clientA.id)}`, {
            jar: userB.jar,
            expected: [404]
        });
        await request(`/api/oauth/clients/${encodeURIComponent(clientA.id)}`, {
            method: 'DELETE',
            jar: userB.jar,
            expected: [404]
        });
        check('a second user cannot read or deactivate another owner client', true);

        await waitForAdmin(userB.jar, userB.username);
        const adminSession = await request('/api/auth/session', { jar: userB.jar });
        check('role changes are read from the database on each authenticated request',
            adminSession.body?.user?.role === 'admin');

        const adminPage = await request('/admin.html', { jar: userB.jar });
        const adminHealth = await request('/api/dashboard/monitoring/health', { jar: userB.jar });
        const adminStats = await request('/api/dashboard/logs/stats', { jar: userB.jar });
        const adminLogs = await request('/api/dashboard/logs/security?limit=2', { jar: userB.jar });
        const adminSessions = await request('/api/dashboard/logs/sessions?limit=2', { jar: userB.jar });
        const adminUsers = await request('/api/users?limit=5', { jar: userB.jar });
        check('simple admin page and health/stats/log/user APIs are operational',
            adminPage.response.headers.get('cache-control')?.includes('no-store') &&
            adminHealth.body?.success === true &&
            adminStats.body?.success === true &&
            adminLogs.body?.success === true &&
            adminSessions.body?.success === true &&
            adminUsers.body?.success === true);
        check('admin API payloads exclude credential and token hashes',
            !containsForbiddenKey(adminLogs.body) &&
            !containsForbiddenKey(adminSessions.body) &&
            !containsForbiddenKey(adminUsers.body));
        check('security logs do not expose isolated audit email addresses',
            !JSON.stringify(adminLogs.body).includes(userA.email) &&
            !JSON.stringify(adminLogs.body).includes(userB.email));

        const updatedUsername = `${RUN_MARKER}_updated`;
        await request(`/api/users/${userA.id}`, {
            method: 'PUT',
            jar: userB.jar,
            body: { username: updatedUsername }
        });
        userA.username = updatedUsername;
        const refreshedSessionA = await request('/api/auth/session', { jar: userA.jar });
        check('admin user edit persists and first-party session reloads current identity',
            refreshedSessionA.body?.user?.username === updatedUsername);

        const unauthPkce = pkce();
        const unauthState = crypto.randomBytes(16).toString('base64url');
        const unauthNonce = crypto.randomBytes(16).toString('base64url');
        const unauthAuthorize = await request(
            `/api/oauth/authorize?${oauthParams(clientA.id, unauthPkce, unauthState, unauthNonce, 'none')}`,
            { expected: [302] }
        );
        const unauthRedirect = new URL(unauthAuthorize.location);
        check('prompt=none returns login_required without an AuthSys session',
            unauthRedirect.searchParams.get('error') === 'login_required' &&
            unauthRedirect.searchParams.get('state') === unauthState);

        const firstPkce = pkce();
        const firstState = crypto.randomBytes(16).toString('base64url');
        const firstNonce = crypto.randomBytes(16).toString('base64url');
        const firstParams = oauthParams(clientA.id, firstPkce, firstState, firstNonce);
        const silentBeforeConsent = await request(
            `/api/oauth/authorize?${oauthParams(clientA.id, firstPkce, firstState, firstNonce, 'none')}`,
            { jar: userA.jar, expected: [302] }
        );
        const silentRedirect = new URL(silentBeforeConsent.location);
        check('prompt=none returns consent_required before a grant exists',
            silentRedirect.searchParams.get('error') === 'consent_required' &&
            silentRedirect.searchParams.get('state') === firstState);

        const consentRedirect = await request(
            `/api/oauth/authorize?${firstParams}`,
            { jar: userA.jar, expected: [302] }
        );
        check('interactive authorization reaches the AuthSys consent page',
            consentRedirect.location?.startsWith('/consent.html?'));
        const consentPage = await request(consentRedirect.location, { jar: userA.jar });
        check('consent page is authenticated and non-cacheable',
            consentPage.response.headers.get('cache-control')?.includes('no-store'));

        const csrfDeny = await request('/api/oauth/csrf', { jar: userA.jar });
        const deny = await request('/api/oauth/authorize', {
            method: 'POST',
            jar: userA.jar,
            body: {
                ...Object.fromEntries(firstParams.entries()),
                csrf_token: csrfDeny.body.csrf_token,
                action: 'deny'
            }
        });
        const deniedRedirect = new URL(deny.body.redirect_url);
        check('decline returns standards-shaped access_denied and preserves state',
            deny.body?.success === false &&
            deniedRedirect.searchParams.get('error') === 'access_denied' &&
            deniedRedirect.searchParams.get('state') === firstState);

        await request(`/api/oauth/authorize?${firstParams}`, {
            jar: userA.jar,
            expected: [302]
        });
        const csrfAllow = await request('/api/oauth/csrf', { jar: userA.jar });
        const allow = await request('/api/oauth/authorize', {
            method: 'POST',
            jar: userA.jar,
            body: {
                ...Object.fromEntries(firstParams.entries()),
                csrf_token: csrfAllow.body.csrf_token,
                action: 'allow'
            }
        });
        const allowedRedirect = new URL(allow.body.redirect_url);
        const authorizationCode = allowedRedirect.searchParams.get('code');
        check('allow returns a one-time code and preserves state',
            allow.body?.success === true &&
            /^[A-Za-z0-9._~-]+$/.test(authorizationCode || '') &&
            allowedRedirect.searchParams.get('state') === firstState);

        const clientAuthorization = basicAuth(clientA.id, clientA.secret);
        const tokens = await request('/api/oauth/token', {
            method: 'POST',
            headers: { Authorization: clientAuthorization },
            body: {
                grant_type: 'authorization_code',
                code: authorizationCode,
                redirect_uri: REDIRECT_URI,
                code_verifier: firstPkce.verifier
            }
        });
        check('authorization code exchange returns OIDC and rotating refresh credentials',
            tokens.body?.token_type === 'Bearer' &&
            typeof tokens.body?.access_token === 'string' &&
            typeof tokens.body?.id_token === 'string' &&
            typeof tokens.body?.refresh_token === 'string' &&
            tokens.response.headers.get('cache-control')?.includes('no-store'));

        await verifyIdToken(tokens.body.id_token, {
            clientId: clientA.id,
            nonce: firstNonce,
            userId: userA.id
        });

        const userInfo = await request('/api/oauth/userinfo', {
            headers: { Authorization: `Bearer ${tokens.body.access_token}` }
        });
        check('UserInfo subject and granted claims match the verified ID token',
            userInfo.body?.sub === userA.id &&
            userInfo.body?.email === userA.email &&
            userInfo.body?.username === userA.username);

        const active = await request('/api/oauth/introspect', {
            method: 'POST',
            headers: { Authorization: clientAuthorization },
            body: { token: tokens.body.access_token }
        });
        check('own client introspection reports a live audience-bound token',
            active.body?.active === true &&
            active.body?.sub === userA.id &&
            active.body?.client_id === clientA.id);

        const foreignIntrospection = await request('/api/oauth/introspect', {
            method: 'POST',
            headers: { Authorization: basicAuth(clientB.id, clientB.secret) },
            body: { token: tokens.body.access_token }
        });
        check('another confidential client sees a foreign token only as inactive',
            foreignIntrospection.body?.active === false);

        const rotated = await request('/api/oauth/token', {
            method: 'POST',
            headers: { Authorization: clientAuthorization },
            body: {
                grant_type: 'refresh_token',
                refresh_token: tokens.body.refresh_token
            }
        });
        check('refresh rotates both access and refresh credentials',
            rotated.body?.access_token !== tokens.body.access_token &&
            rotated.body?.refresh_token !== tokens.body.refresh_token);

        await request('/api/oauth/token', {
            method: 'POST',
            headers: { Authorization: clientAuthorization },
            body: {
                grant_type: 'refresh_token',
                refresh_token: tokens.body.refresh_token
            },
            expected: [401]
        });
        check('replaying the consumed refresh token is rejected', true);

        await request('/api/oauth/revoke', {
            method: 'POST',
            headers: { Authorization: clientAuthorization },
            body: { token: rotated.body.access_token }
        });
        const revoked = await request('/api/oauth/introspect', {
            method: 'POST',
            headers: { Authorization: clientAuthorization },
            body: { token: rotated.body.access_token }
        });
        check('RFC-style revocation makes introspection inactive', revoked.body?.active === false);

        const secondPkce = pkce();
        const secondState = crypto.randomBytes(16).toString('base64url');
        const secondNonce = crypto.randomBytes(16).toString('base64url');
        const secondParams = oauthParams(clientA.id, secondPkce, secondState, secondNonce);
        const rememberedConsent = await request(
            `/api/oauth/authorize?${secondParams}`,
            { jar: userA.jar, expected: [302] }
        );
        const rememberedRedirect = new URL(rememberedConsent.location);
        const secondCode = rememberedRedirect.searchParams.get('code');
        check('active AuthSys session + remembered consent silently issues a new code',
            Boolean(secondCode) && rememberedRedirect.searchParams.get('state') === secondState);

        const secondTokens = await request('/api/oauth/token', {
            method: 'POST',
            headers: { Authorization: clientAuthorization },
            body: {
                grant_type: 'authorization_code',
                code: secondCode,
                redirect_uri: REDIRECT_URI,
                code_verifier: secondPkce.verifier
            }
        });

        const consents = await request('/api/oauth/consents', { jar: userA.jar });
        check('user consent management lists the active grant',
            consents.body?.data?.consents?.some((consent) => consent.client_id === clientA.id));

        await request(`/api/oauth/consents/${encodeURIComponent(clientA.id)}`, {
            method: 'DELETE',
            jar: userA.jar
        });
        const inactiveAfterConsent = await request('/api/oauth/introspect', {
            method: 'POST',
            headers: { Authorization: clientAuthorization },
            body: { token: secondTokens.body.access_token }
        });
        await request('/api/oauth/token', {
            method: 'POST',
            headers: { Authorization: clientAuthorization },
            body: {
                grant_type: 'refresh_token',
                refresh_token: secondTokens.body.refresh_token
            },
            expected: [401]
        });
        check('revoking consent invalidates both access and refresh credentials',
            inactiveAfterConsent.body?.active === false);

        const silentAfterRevoke = await request(
            `/api/oauth/authorize?${oauthParams(clientA.id, pkce(), crypto.randomBytes(16).toString('base64url'), crypto.randomBytes(16).toString('base64url'), 'none')}`,
            { jar: userA.jar, expected: [302] }
        );
        check('silent authorization requires consent again after revocation',
            new URL(silentAfterRevoke.location).searchParams.get('error') === 'consent_required');

        await request(`/api/oauth/clients/${encodeURIComponent(clientA.id)}`, {
            method: 'DELETE',
            jar: userA.jar
        });
        await request(`/api/oauth/clients/${encodeURIComponent(clientB.id)}`, {
            method: 'DELETE',
            jar: userB.jar
        });
        const invalidatedClient = await request(
            `/api/oauth/authorize?${oauthParams(clientA.id, pkce(), crypto.randomBytes(16).toString('base64url'), crypto.randomBytes(16).toString('base64url'))}`,
            { jar: userA.jar, expected: [401] }
        );
        check('deactivated client can no longer start authorization',
            invalidatedClient.body?.error === 'invalid_client');

        await request('/api/auth/delete-account', {
            method: 'DELETE',
            jar: userA.jar,
            body: { password: userA.password }
        });
        userA.deleted = true;
        await request('/api/auth/delete-account', {
            method: 'DELETE',
            jar: userB.jar,
            body: { password: userB.password }
        });
        userB.deleted = true;

        const deadSessionA = await request('/api/auth/session', { jar: userA.jar });
        const deadSessionB = await request('/api/auth/session', { jar: userB.jar });
        check('account deletion destroys both browser sessions',
            deadSessionA.body?.authenticated === false &&
            deadSessionB.body?.authenticated === false);

        const relogin = await request('/api/auth/login', {
            method: 'POST',
            body: { email: userA.email, password: userA.password, remember: false },
            expected: [401]
        });
        check('anonymized deleted account cannot log in and does not expose state',
            relogin.body?.error === 'Invalid credentials');

        console.log(`LIVE_AUDIT_COMPLETE checks=${passed} marker=${RUN_MARKER}`);
    } finally {
        for (const user of [userA, userB]) {
            if (!user.registered || user.deleted) continue;
            try {
                await request('/api/auth/delete-account', {
                    method: 'DELETE',
                    jar: user.jar,
                    body: { password: user.password },
                    expected: [200, 401]
                });
            } catch {
                // A remote cleanup step removes only this run marker afterward.
            }
        }
    }
}

run().catch((error) => {
    console.error(`LIVE_AUDIT_FAILED marker=${RUN_MARKER} error=${error.message}`);
    process.exitCode = 1;
});
