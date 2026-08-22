'use strict';

// Keep the private deployment deliberately small: only scopes that AuthSys
// actually understands are accepted. Resource/API scopes can be added later
// together with real middleware enforcement.
const OIDC_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access']);
const DEFAULT_OIDC_SCOPES = ['openid', 'profile', 'email'];
const SCOPE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9:._-]{0,127}$/;

function parseScopes(scope) {
    return new Set(String(scope || '').split(/\s+/).filter(Boolean));
}

function parseScopeList(scope, fallback = DEFAULT_OIDC_SCOPES) {
    const value = String(scope || '').trim();
    const names = (value ? value.split(/\s+/) : fallback)
        .filter(Boolean);
    return [...new Set(names)];
}

/**
 * Validate the allow-list stored on an OAuth client.
 *
 * offline_access is not implicit. It is accepted only when the client
 * explicitly registers it, and every client must register openid for this
 * OIDC server.
 */
function validateRegisteredScopes(scope) {
    const scopes = parseScopeList(scope);
    const invalid = scopes.filter(name =>
        name === 'role' || !SCOPE_NAME_PATTERN.test(name) || !OIDC_SCOPES.has(name)
    );

    if (invalid.length) {
        return {
            valid: false,
            scopes,
            invalid,
            error: 'Unsupported scope: ' + invalid[0]
        };
    }

    if (!scopes.includes('openid')) {
        return {
            valid: false,
            scopes,
            invalid: [],
            error: 'openid scope is required'
        };
    }

    return { valid: true, scopes, invalid: [] };
}

/**
 * Clamp the requested scope to the client's registered allow-list.
 * Any unregistered scope is rejected instead of silently dropped so the
 * consent screen and the issued token cannot disagree.
 */
function sanitizeRequestedScopes(scope, clientScope) {
    const requested = parseScopeList(scope);
    const allowed = parseScopes(
        clientScope || DEFAULT_OIDC_SCOPES.join(' ')
    );

    if (!requested.length ||
        !requested.includes('openid') ||
        requested.some(name => name === 'role' || !OIDC_SCOPES.has(name) || !allowed.has(name))) {
        return [];
    }

    return requested;
}

module.exports = {
    OIDC_SCOPES,
    DEFAULT_OIDC_SCOPES,
    parseScopes,
    parseScopeList,
    validateRegisteredScopes,
    sanitizeRequestedScopes
};