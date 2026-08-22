/**
 * OAuth 2.0 PKCE Full Flow + Client Management Tests
 * Requires server running at TEST_BASE_URL (default: http://localhost:5000)
 */

const crypto = require('crypto');
const { post, get, put, del } = require('./helpers/request');
const { createTestUser, cleanupUser } = require('./helpers/users');

// ─── PKCE Helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier() {
    return crypto.randomBytes(32)
        .toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256')
        .update(verifier)
        .digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── State ────────────────────────────────────────────────────────────────────

let user;
let clientId, clientSecret, redirectUri;
const REDIRECT_URI = process.env.TEST_REDIRECT_URI || 'http://localhost:3001/callback';
let browserCookie;

function cookieHeader(response) {
    return (response.headers['set-cookie'] || [])
        .map(value => value.split(';')[0])
        .join('; ');
}

async function ensureBrowserSession() {
    const login = await post('/api/auth/login', {
        email: user.email,
        password: user.password
    });
    if (login.status !== 200) {
        throw new Error('Browser session login failed: ' + JSON.stringify(login.data));
    }
    browserCookie = cookieHeader(login);
    if (!browserCookie) throw new Error('Browser session cookie was not returned');
}

async function authorizeWithSession(options = {}) {
    if (!browserCookie) await ensureBrowserSession();

    const {
        scope = 'openid profile email offline_access',
        client = clientId,
        redirect = redirectUri,
        codeVerifier = generateCodeVerifier()
    } = options;
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(8).toString('hex');
    const nonce = crypto.randomBytes(8).toString('hex');
    const csrf = await get('/api/oauth/csrf', null, {
        headers: { Cookie: browserCookie }
    });
    if (csrf.status !== 200) {
        throw new Error('CSRF token request failed: ' + JSON.stringify(csrf.data));
    }

    const res = await post('/api/oauth/authorize', {
        client_id: client,
        redirect_uri: redirect,
        response_type: 'code',
        scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        nonce,
        action: 'allow',
        csrf_token: csrf.data.csrf_token
    }, null, { headers: { Cookie: browserCookie } });

    return { res, codeVerifier, codeChallenge, state, nonce };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
    user = await createTestUser('oauth');
});

afterAll(async () => {
    if (user) await cleanupUser(user.password, user.token);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Client Registration', () => {
    it('valid data → 201, returns client_id + client_secret', async () => {
        const res = await post('/api/oauth/clients', {
            client_name:   'Test OAuth Client',
            redirect_uris: [REDIRECT_URI],
            contact_email: user.email,
            scope:         'openid profile email offline_access',
        }, user.token);
        expect(res.status).toBe(201);
        expect(res.data.success).toBe(true);
        const d = res.data.data || res.data;
        expect(d.client_id).toBeTruthy();
        expect(d.client_secret).toBeTruthy();
        clientId     = d.client_id;
        clientSecret = d.client_secret;
        redirectUri  = REDIRECT_URI;
    });

    it('missing client_name → 400', async () => {
        const res = await post('/api/oauth/clients', {
            redirect_uris: [REDIRECT_URI],
            contact_email: user.email,
        }, user.token);
        expect(res.status).toBe(400);
    });

    it('missing redirect_uris → 400', async () => {
        const res = await post('/api/oauth/clients', {
            client_name:   'No Redirect',
            contact_email: user.email,
        }, user.token);
        expect(res.status).toBe(400);
    });

    it('without auth → 401', async () => {
        const res = await post('/api/oauth/clients', {
            client_name:   'Unauth Client',
            redirect_uris: [REDIRECT_URI],
            contact_email: 'x@x.com',
        });
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Client CRUD', () => {
    it('GET /api/oauth/clients → 200, array includes our client', async () => {
        const res = await get('/api/oauth/clients', user.token);
        expect(res.status).toBe(200);
        const clients = res.data.data?.clients || res.data.clients || res.data.data || [];
        expect(Array.isArray(clients)).toBe(true);
        const found = clients.find(c => c.client_id === clientId);
        expect(found).toBeTruthy();
    });

    it('GET /api/oauth/clients/:id → 200', async () => {
        const res = await get(`/api/oauth/clients/${clientId}`, user.token);
        expect(res.status).toBe(200);
        const d = res.data.data || res.data;
        expect(d.client_id).toBe(clientId);
    });

    it('GET non-existent client → 404/500', async () => {
        const res = await get('/api/oauth/clients/notarealclientid', user.token);
        expect([404, 500, 400]).toContain(res.status);
    });

    it('PUT /api/oauth/clients/:id → 200, description updated', async () => {
        const res = await put(`/api/oauth/clients/${clientId}`, {
            description: 'Updated description',
        }, user.token);
        expect(res.status).toBe(200);
    });

    it('DELETE /api/oauth/clients/:id → 200 (soft delete)', async () => {
        // We'll re-create later, so use a second client for this test
        const regRes = await post('/api/oauth/clients', {
            client_name:   'Client To Delete',
            redirect_uris: [REDIRECT_URI],
            contact_email: user.email,
        }, user.token);
        const tempId = (regRes.data.data || regRes.data).client_id;

        const res = await del(`/api/oauth/clients/${tempId}`, null, user.token);
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OAuth PKCE Authorization + Token Exchange', () => {
    let authCode;
    let oauthAccessToken, oauthRefreshToken;
    let codeVerifier;

    it('POST /api/oauth/authorize with AuthSys session → code', async () => {
        const flow = await authorizeWithSession({ scope: 'openid profile email offline_access' });
        codeVerifier = flow.codeVerifier;
        const res = flow.res;
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        const redirectUrl = res.data.redirect_url || res.data.data?.redirect_url;
        expect(redirectUrl).toBeTruthy();
        expect(redirectUrl).toContain('code=');
        authCode = new URL(redirectUrl).searchParams.get('code');
        expect(authCode).toBeTruthy();
    });

    it('direct email/password in authorize body is rejected', async () => {
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(codeVerifier);
        const res = await post('/api/oauth/authorize', {
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid profile email',
            state: crypto.randomBytes(8).toString('hex'),
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            nonce: crypto.randomBytes(8).toString('hex'),
            action: 'allow',
            email: user.email,
            password: user.password
        });
        expect(res.status).toBe(401);
        expect(res.data.error).toBe('login_required');
    });

    it('POST /api/oauth/token (code exchange with PKCE) → 200, tokens', async () => {
        const res = await post('/api/oauth/token', {
            grant_type:    'authorization_code',
            code:          authCode,
            client_id:     clientId,
            client_secret: clientSecret,
            redirect_uri:  redirectUri,
            code_verifier: codeVerifier,
        });
        expect(res.status).toBe(200);
        expect(res.data.access_token).toBeTruthy();
        expect(res.data.id_token).toBeTruthy();
        expect(res.data.refresh_token).toBeTruthy();
        expect(res.data.token_type).toBe('Bearer');
        oauthAccessToken  = res.data.access_token;
        oauthRefreshToken = res.data.refresh_token;
    });

    it('replay same code → 400 invalid_grant', async () => {
        const res = await post('/api/oauth/token', {
            grant_type:    'authorization_code',
            code:          authCode,
            client_id:     clientId,
            client_secret: clientSecret,
            redirect_uri:  redirectUri,
            code_verifier: codeVerifier,
        });
        expect([400, 401]).toContain(res.status);
        const errorMsg = res.data.error || res.data.message || '';
        expect(errorMsg.toLowerCase()).toMatch(/invalid|expired|used/);
    });

    it('wrong code_verifier → 400', async () => {
        const verifier2 = generateCodeVerifier();
        const flow2 = await authorizeWithSession({ codeVerifier: verifier2 });
        const url2 = flow2.res.data.redirect_url || flow2.res.data.data?.redirect_url;
        const code2 = url2 ? new URL(url2).searchParams.get('code') : null;
        expect(code2).toBeTruthy();

        const res = await post('/api/oauth/token', {
            grant_type:    'authorization_code',
            code:          code2,
            client_id:     clientId,
            client_secret: clientSecret,
            redirect_uri:  redirectUri,
            code_verifier: 'wrongverifier_this_will_not_match_the_challenge',
        });
        expect([400, 401]).toContain(res.status);
    });

    it('OAuth refresh_token grant → 200, new access_token', async () => {
        if (!oauthRefreshToken) return; // skip if previous test failed
        const res = await post('/api/oauth/token', {
            grant_type:    'refresh_token',
            refresh_token: oauthRefreshToken,
            client_id:     clientId,
            client_secret: clientSecret,
        });
        expect(res.status).toBe(200);
        expect(res.data.access_token).toBeTruthy();
        oauthAccessToken = res.data.access_token;
    });

    // Store tokens for use in subsequent describe blocks
    afterAll(() => {
        oauthState.accessToken  = oauthAccessToken;
        oauthState.refreshToken = oauthRefreshToken;
    });
});

// Shared state between describe blocks
const oauthState = {};

// ─────────────────────────────────────────────────────────────────────────────

describe('Userinfo', () => {
    it('GET /api/oauth/userinfo with valid OAuth token → 200, sub/email/username', async () => {
        if (!oauthState.accessToken) {
            console.warn('Skipping: no OAuth access token from previous test');
            return;
        }
        const res = await get('/api/oauth/userinfo', oauthState.accessToken);
        expect(res.status).toBe(200);
        expect(res.data.sub).toBeTruthy();
        expect(res.data.email).toBe(user.email);
    });

    it('without token → 401', async () => {
        const res = await get('/api/oauth/userinfo');
        expect(res.status).toBe(401);
    });

    it('invalid token → 401', async () => {
        const res = await get('/api/oauth/userinfo', 'not.a.real.token');
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Introspect', () => {
    it('active OAuth token → 200 { active: true }', async () => {
        if (!oauthState.accessToken) return;
        const res = await post('/api/oauth/introspect', {
            token:         oauthState.accessToken,
            client_id:     clientId,
            client_secret: clientSecret,
        });
        expect(res.status).toBe(200);
        expect(res.data.active).toBe(true);
        expect(res.data.sub).toBeTruthy();
    });

    it('garbage token → 200 { active: false }', async () => {
        const res = await post('/api/oauth/introspect', {
            token:         'garbage.token.value',
            client_id:     clientId,
            client_secret: clientSecret,
        });
        expect(res.status).toBe(200);
        expect(res.data.active).toBe(false);
    });

    it('wrong client_secret → 401', async () => {
        if (!oauthState.accessToken) return;
        const res = await post('/api/oauth/introspect', {
            token:         oauthState.accessToken,
            client_id:     clientId,
            client_secret: 'wrong_secret',
        });
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Revoke Token', () => {
    it('POST /api/oauth/revoke → 200', async () => {
        if (!oauthState.accessToken) return;
        // The revoke endpoint uses authenticate middleware, so pass the token as Authorization header
        // AND in the body as the token to revoke (same token — revokes itself)
        const res = await post('/api/oauth/revoke', { token: oauthState.accessToken }, oauthState.accessToken);
        expect(res.status).toBe(200);
    });

    it('revoked token → introspect returns { active: false }', async () => {
        if (!oauthState.accessToken) return;
        const res = await post('/api/oauth/introspect', {
            token:         oauthState.accessToken,
            client_id:     clientId,
            client_secret: clientSecret,
        });
        expect(res.status).toBe(200);
        expect(res.data.active).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scope Enforcement', () => {
    it('unregistered resource scope → 400 invalid_scope', async () => {
        const flow = await authorizeWithSession({ scope: 'openid profile email admin:read write:all' });
        const res = flow.res;
        expect(res.status).toBe(400);
        const message = res.data.error || res.data.message || res.data;
        expect(String(message).toLowerCase()).toMatch(/invalid_scope|unsupported|scope/);
    });

    it('OIDC base scopes → allowed', async () => {
        const res = (await authorizeWithSession({ scope: 'openid profile email' })).res;
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
    });
});
