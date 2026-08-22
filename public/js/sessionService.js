/**
 * Browser session API wrapper.
 * Authentication is provided by the HttpOnly AuthSys session cookie.
 */
class SessionService {
    constructor() {
        this.baseURL = '/api';
    }

    async request(endpoint, options = {}) {
        const url = this.baseURL + endpoint;
        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: options.credentials || 'same-origin'
        };

        const response = await fetch(url, config);
        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                throw new Error('HTTP ' + response.status + ': ' + errorText);
            }
            throw new Error(errorData.error || errorData.message || 'HTTP ' + response.status);
        }

        return response.json();
    }

    async getSessions() {
        return this.request('/sessions');
    }

    async revokeSession(sessionId) {
        return this.request('/sessions/' + encodeURIComponent(sessionId), {
            method: 'DELETE'
        });
    }

    async revokeAllOtherSessions() {
        return this.request('/sessions/others/all', {
            method: 'DELETE'
        });
    }

    async getSessionCount() {
        return this.request('/sessions/count');
    }
}

const sessionService = new SessionService();