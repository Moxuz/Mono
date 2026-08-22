/**
 * User factory helpers.
 * Creates real test users via the API and cleans them up after tests.
 */

const { post, del } = require('./request');

let counter = 0;

/**
 * Register + login a test user.
 * Returns { email, password, username, token, refreshToken, sessionId }
 */
async function createTestUser(suffix = '') {
    counter++;
    const ts = Date.now().toString(36); // ~8 base36 chars, always unique
    const id = `${ts}${counter}`;
    const email    = `t${id}@test.io`;
    const password = `TestPass${counter}1!`;
    const username = `u${id}`; // ~10 chars, well under 30-char limit

    const reg = await post('/api/auth/register', {
        username,
        email,
        password,
        consentEssential: true,
    });

    if (reg.status !== 201) {
        throw new Error(`createTestUser: register failed ${reg.status} — ${JSON.stringify(reg.data)}`);
    }

    const login = await post('/api/auth/login/token', { email, password });
    if (login.status !== 200) {
        throw new Error(`createTestUser: login failed ${login.status} — ${JSON.stringify(login.data)}`);
    }

    const d = login.data.data || login.data;
    return {
        email,
        password,
        username,
        token:        d.token,
        refreshToken: d.refreshToken,
        sessionId:    d.sessionId,
    };
}

/**
 * Delete a test user (best-effort — won't throw on failure).
 */
async function cleanupUser(password, token) {
    try {
        await del('/api/auth/delete-account', { password }, token);
    } catch (_) { /* ignore */ }
}

module.exports = { createTestUser, cleanupUser };
