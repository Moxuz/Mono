// public/js/sessionService.js

class SessionService {
    constructor() {
        this.baseURL = '/api';
    }

    getToken() {
        const token = localStorage.getItem('token');
        return token;
    }

    async request(endpoint, options = {}) {
        const token = this.getToken();
        
        if (!token) {
            throw new Error('No authentication token. Please login again.');
        }
        
        // 🔧 แก้ URL path
        const url = `${this.baseURL}${endpoint}`;
        console.log('📡 Request:', url);
        
        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('❌ API Error:', error);
            throw error;
        }
    }

    async getSessions() {
        // 🔧 ใช้ /sessions แทน /auth/sessions
        return await this.request('/sessions');
    }

    async revokeSession(sessionId) {
        return await this.request(`/sessions/${sessionId}`, {
            method: 'DELETE'
        });
    }

    async revokeAllOtherSessions() {
        return await this.request('/sessions/others/all', {
            method: 'DELETE'
        });
    }

    async getSessionCount() {
        return await this.request('/sessions/count');
    }
}

const sessionService = new SessionService();