/**
 * First-party pages authenticate with the HttpOnly AuthSys session cookie.
 * This guard prevents stale bearer headers from older bundles from being
 * sent, without reading or writing browser tokens.
 */
(function () {
    const nativeFetch = window.fetch.bind(window);

    window.AuthSession = {
        refresh: async () => null,
        currentToken: () => null
    };

    window.fetch = function (input, init = {}) {
        const headers = new Headers(init.headers || {});
        const authorization = headers.get('Authorization');
        if (authorization && /^Bearer\s+/i.test(authorization)) {
            headers.delete('Authorization');
        }

        return nativeFetch(input, {
            ...init,
            headers,
            credentials: init.credentials || 'same-origin'
        });
    };
})();