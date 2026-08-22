const { broadcastMetrics } = require('../../../shared/utils/websocket');

const state = {
    activeUsers: new Map(),
    loginAttempts: []
};

function recordLoginAttempt(success, ipAddress, userId = null) {
    state.loginAttempts.push({ timestamp: new Date(), success, ipAddress, userId });
    if (state.loginAttempts.length > 1000) state.loginAttempts.shift();

    broadcastMetrics({
        event: 'login_attempt',
        success,
        timestamp: new Date().toISOString()
    });
}

function recordActiveUser(userId) {
    if (!userId) return;
    state.activeUsers.set(String(userId), new Date());
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    for (const [id, lastActive] of state.activeUsers.entries()) {
        if (lastActive < cutoff) state.activeUsers.delete(id);
    }
}

function getSnapshot() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentAttempts = state.loginAttempts.filter(attempt => attempt.timestamp > fiveMinutesAgo);
    return {
        activeUsersCount: state.activeUsers.size,
        recentAttempts
    };
}

module.exports = { recordLoginAttempt, recordActiveUser, getSnapshot };
