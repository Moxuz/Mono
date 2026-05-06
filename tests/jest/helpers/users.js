/**
 * User factory helpers.
 * Creates real test users via the API and cleans them up after tests.
 */

const { post, del } = require('./request');

let counter = 0;

async function createTestUser(suffix = '') {
    counter++;
    const ts = Date.now().toString(36);
    const id = `${ts}${counter}`;
    const email    = `t${id}@test.io`;
    const password = `TestPass${counter}1!`;
    const username = `u${id}`;

    const reg = await post('/api/auth/register', {
        username,
        email,
        password,
        consentEssential: true,
    });

    if (reg.status !== 201) {
        throw new Error(`createTestUser: register failed ${reg.status} — ${JSON.stringify(reg.data)}`);
    }

    const login = await post('/api/auth/login', { email, password });
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

async function cleanupUser(password, token) {
    try {
        await del('/api/auth/delete-account', { password }, token);
    } catch (_) { /* ignore */ }
}

module.exports = { createTestUser, cleanupUser };
