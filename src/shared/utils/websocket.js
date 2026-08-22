const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const SecurityAudit = require('../models/SecurityAudit');
const logger = require('../utils/logger');
const config = require('../config/config');
const TokenBlacklist = require('../models/TokenBlacklist');

let wss = null;
const clients = new Set();

/**
 * Initialize WebSocket server for real-time updates
 */
function initializeWebSocket(server) {
    // Use noServer mode so we can authenticate before accepting the upgrade
    wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', async (request, socket, head) => {
        if (!request.url.startsWith('/ws')) return;

        // Do not accept query-string tokens: they leak into access logs and
        // browser history. WebSocket clients should use Authorization or the
        // HttpOnly token cookie set by the auth flow.
        const cookieHeader = request.headers.cookie || '';
        const tokenCookie = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith('token='));
        const token = (request.headers['authorization'] || '').replace('Bearer ', '') ||
            (tokenCookie ? decodeURIComponent(tokenCookie.slice('token='.length)) : '');

        if (!token) {
            logger.warn('WebSocket rejected: no token provided');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        try {
            request.wsUser = jwt.verify(token, config.JWT_SECRET);
            if (request.wsUser.type !== 'access_token' || await TokenBlacklist.isBlacklisted(token)) {
                throw new Error('Invalid access token');
            }
        } catch {
            logger.warn('WebSocket rejected: invalid or expired token');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    wss.on('connection', (ws, request) => {
        const user = request.wsUser;
        logger.info('WebSocket client connected', { userId: user?.id, role: user?.role });
        clients.add(ws);

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('close', () => {
            logger.info('WebSocket client disconnected');
            clients.delete(ws);
        });

        ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
            clients.delete(ws);
        });

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to real-time updates',
            timestamp: new Date().toISOString()
        }));
    });

    // Heartbeat to keep connections alive
    const interval = setInterval(() => {
        clients.forEach((ws) => {
            if (ws.isAlive === false) {
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(interval);
    });

    logger.info('WebSocket server initialized');
    return wss;
}

/**
 * Broadcast message to all connected clients
 */
function broadcast(message) {
    if (!wss || clients.size === 0) return;

    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

/**
 * Send real-time security event update
 */
function broadcastSecurityEvent(event) {
    broadcast({
        type: 'security_event',
        data: {
            action: event.action,
            status: event.status,
            userId: event.userId?.toString(),
            ipAddress: event.ipAddress,
            timestamp: event.timestamp
        }
    });
}

/**
 * Send login attempt update
 */
function broadcastLoginAttempt(success, ipAddress, userId = null) {
    broadcast({
        type: 'login_attempt',
        data: {
            success,
            ipAddress,
            userId: userId?.toString(),
            timestamp: new Date().toISOString()
        }
    });
}

/**
 * Send system metrics update
 */
function broadcastMetrics(metrics) {
    broadcast({
        type: 'metrics_update',
        data: metrics
    });
}

/**
 * Get connected clients count
 */
function getConnectedClientsCount() {
    return clients.size;
}

/**
 * Close all connections
 */
function closeAllConnections() {
    if (wss) {
        clients.forEach((client) => {
            client.close();
        });
        wss.close();
        logger.info('WebSocket server closed');
    }
}

module.exports = {
    initializeWebSocket,
    broadcast,
    broadcastSecurityEvent,
    broadcastLoginAttempt,
    broadcastMetrics,
    getConnectedClientsCount,
    closeAllConnections
};
