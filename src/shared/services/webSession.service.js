'use strict';

function normalizeUser(user, sessionId = null) {
    return {
        id: (user.id || user._id).toString(),
        email: user.email,
        username: user.username,
        role: user.role,
        provider: user.provider || (user.googleId ? 'google' : user.githubId ? 'github' : 'local'),
        sessionId: sessionId || null
    };
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((error) => error ? reject(error) : resolve());
    });
}

const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 1000;
const REMEMBERED_SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/**
 * Establish the first-party browser session without exposing bearer tokens to
 * localStorage, sessionStorage, URL fragments, or query strings.
 */
async function establishWebSession(req, user, sessionId = null, preserve = [], options = {}) {
    if (!req?.session || !user) return false;

    const preservedValues = Object.fromEntries(
        preserve.filter((key) => req.session[key] !== undefined)
            .map((key) => [key, req.session[key]])
    );

    await new Promise((resolve, reject) => {
        req.session.regenerate((error) => error ? reject(error) : resolve());
    });

    Object.assign(req.session, preservedValues);
    req.session.user = normalizeUser(user, sessionId);
    req.session.authenticatedAt = new Date().toISOString();
    const maxAge = options.remember ? REMEMBERED_SESSION_MAX_AGE : DEFAULT_SESSION_MAX_AGE;
    req.session.cookie.maxAge = maxAge;
    req.session.cookie.originalMaxAge = maxAge;
    await saveSession(req);
    return true;
}

async function destroyWebSession(req) {
    if (!req?.session) return;
    await new Promise((resolve, reject) => {
        req.session.destroy((error) => error ? reject(error) : resolve());
    });
}

module.exports = {
    normalizeUser,
    establishWebSession,
    destroyWebSession,
    saveSession,
    DEFAULT_SESSION_MAX_AGE,
    REMEMBERED_SESSION_MAX_AGE
};
