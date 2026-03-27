const Session = require('../models/Session');
const crypto = require('crypto');
const logger = require('../utils/logger');
const securityAuditService = require('../services/securityAudit.service');


/**
 * Parse user agent string
 */
function parseUserAgent(userAgent) {
    if (!userAgent) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
    
    const ua = userAgent.toLowerCase();
    
    // Detect browser
    let browser = 'Unknown';
    if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';
    else if (ua.includes('msie') || ua.includes('trident')) browser = 'IE';
    
    // Detect OS - check iOS before macOS
    let os = 'Unknown';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) os = 'iOS';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac os')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    
    // Detect device
    let device = 'Desktop';
    if (/mobile|android|phone|tablet/.test(ua)) device = 'Mobile';
    
    return { browser, os, device };
}

/**
 * Create new session
 */
async function createSession(userId, accessToken, refreshToken, req) {
    try {
        const userAgent = req?.headers?.['user-agent'] || '';
        let ipAddress = req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0] || 'unknown';
        
   
        
        const deviceInfo = parseUserAgent(userAgent);
        
        const sessionData = {
            userId,
            sessionToken: accessToken,
            refreshToken,
            userAgent,
            ipAddress,  
            deviceInfo
        };
        
        const result = await Session.createSession(sessionData);
        
        logger.info(`Session created for user ${userId}`, {
            function: 'createSession',
            sessionId: result.sessionId,
            device: deviceInfo.browser,
            os: deviceInfo.os,
            ip: ipAddress
        });
        
        return {
            sessionId: result.sessionId,
            sessionToken: result.sessionToken,
            deviceInfo
        };
    } catch (error) {
        logger.error('Create session error:', error);
        throw error;
    }
}

/**
 * Validate session token
 */
async function validateSession(sessionToken) {
    try {
        const session = await Session.validateSession(sessionToken);
        
        if (!session) {
            return { valid: false };
        }
        
        return {
            valid: true,
            session: {
                id: session._id,
                userId: session.userId,
                deviceInfo: session.deviceInfo,
                lastActiveAt: session.lastActiveAt,
                createdAt: session.createdAt
            }
        };
    } catch (error) {
        logger.error('Validate session error:', error);
        return { valid: false, error: error.message };
    }
}

/**
 * Get all active sessions for user
 */
async function getUserSessions(userId, currentSessionId = null) {
    try {
        const sessions = await Session.findActiveSessions(userId);
        return { 
            sessions: sessions.map(s => ({ 
                id: s._id, 
                deviceInfo: s.deviceInfo, 
                ipAddress: s.ipAddress?.split('.')[0] + '.*.*.*', 
                lastActiveAt: s.lastActiveAt, 
                createdAt: s.createdAt, 
               
                isCurrent: currentSessionId ? s._id.toString() === currentSessionId : false 
            })), 
            count: sessions.length 
        };
    } catch (error) {
        logger.error('Get user sessions error:', error);
        throw error;
    }
}

/**
 * Revoke specific session
 */
async function revokeSession(sessionId, userId, reason = 'user_logout') {
    try {
        const session = await Session.findOne({ _id: sessionId, userId });
        
        if (!session) {
            throw new Error('Session not found');
        }
        
        await session.revoke(reason);
        
        logger.info(`Session revoked: ${sessionId}`, { function: 'revokeSession', userId, sessionId, reason });
        
        return { success: true, message: 'Session revoked successfully' };
    } catch (error) {
        logger.error('Revoke session error:', error);
        throw error;
    }
}

/**
 * Revoke all sessions except current
 */
async function revokeAllOtherSessions(userId, currentSessionId, reason = 'user_logout') {
    try {
        await Session.revokeAllSessions(userId, reason, currentSessionId);
        
        logger.info(`All other sessions revoked for user ${userId}`, { function: 'revokeAllOtherSessions', userId, excludedSessionId: currentSessionId });

        return { success: true, message: 'All other sessions revoked' };
    } catch (error) {
        logger.error('Revoke all sessions error:', error);
        throw error;
    }
}

/**
 * Revoke all sessions (including current)
 */
async function revokeAllSessions(userId, reason = 'user_logout') {
    try {
        await Session.revokeAllSessions(userId, reason, null);
        
        logger.info(`All sessions revoked for user ${userId}`, { reason });
        
        return { success: true, message: 'All sessions revoked' };
    } catch (error) {
        logger.error('Revoke all sessions error:', error);
        throw error;
    }
}

/**
 * Get session count for user
 */
async function getSessionCount(userId) {
    try {
        return await Session.getSessionCount(userId);
    } catch (error) {
        logger.error('Get session count error:', error);
        throw error;
    }
}

/**
 * Clean up expired sessions (run periodically)
 */
async function cleanupExpiredSessions() {
    try {
        const result = await Session.deleteMany({ isActive: false });
        logger.info(`Cleaned up ${result.deletedCount} expired sessions`);
        return result.deletedCount;
    } catch (error) {
        logger.error('Cleanup sessions error:', error);
        throw error;
    }
}

/**
 * Check refresh token and rotate if needed
 */
async function validateAndRotateRefreshToken(sessionToken, refreshToken) {
    try {
        const session = await Session.findOne({ sessionToken }).select('+refreshTokenHash +refreshTokenFamily');
        
        if (!session || !session.isActive) {
            return { valid: false, error: 'Invalid session' };
        }
        
        // Hash the provided token and compare
        const providedHash = Session.hashRefreshToken(refreshToken);
        
        if (providedHash !== session.refreshTokenHash) {
            // Token mismatch - possible token theft attempt
            logger.warn('Refresh token mismatch - possible theft attempt', {
                sessionId: session._id,
                userId: session.userId
            });
            
            // Revoke this session and all sessions in the family
            await session.revoke('token_compromised');
            await Session.revokeAllSessions(
                session.userId,
                'token_compromised'
            );
            
            return {
                valid: false,
                error: 'Session compromised - all sessions revoked',
                compromised: true
            };
        }
        
        // Token is valid - update last active
        await session.updateLastActive();
        
        return {
            valid: true,
            session,
            refreshTokenFamily: session.refreshTokenFamily
        };
    } catch (error) {
        logger.error('Validate refresh token error:', error);
        return { valid: false, error: error.message };
    }
}

/**
 * Update refresh token in session (for rotation)
 */
async function updateRefreshToken(sessionToken, newRefreshToken) {
    try {
        const session = await Session.findOne({ sessionToken });
        
        if (!session) {
            throw new Error('Session not found');
        }
        
        session.refreshToken = newRefreshToken;
        session.refreshTokenHash = Session.hashRefreshToken(newRefreshToken);
        await session.save();
        
        return { success: true };
    } catch (error) {
        logger.error('Update refresh token error:', error);
        throw error;
    }
}

module.exports = {
    createSession,
    validateSession,
    getUserSessions,
    revokeSession,
    revokeAllOtherSessions,
    revokeAllSessions,
    getSessionCount,
    cleanupExpiredSessions,
    validateAndRotateRefreshToken,
    updateRefreshToken,
    parseUserAgent
};