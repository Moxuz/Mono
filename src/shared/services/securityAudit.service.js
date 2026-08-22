const SecurityAudit = require('../models/SecurityAudit');
const logger = require('../utils/logger');


/**
 * Log security event
 */
async function logSecurityEvent({ userId, email, action, status, ipAddress, userAgent, metadata }) {
    try {
        const audit = await SecurityAudit.logEvent({
            userId,
            email: email || metadata?.email || null,
            action,
            status,
            ipAddress,
            userAgent,
            metadata
        });

        // Route all security events to the security-events Kafka topic via logger.security()
        logger.security(`Security Event: ${action}`, {
            userId,
            status,
            ipAddress,
            action,
            function: 'logSecurityEvent'
        });

        return audit;
    } catch (error) {
        logger.error('Failed to log security event:', error);
    }
}

/**
 * Login success
 */
async function logLoginSuccess(user, req) {
    return logSecurityEvent({
        userId: user._id,
        email: user.email,
        action: 'login_success',
        status: 'success',
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0],
        userAgent: req?.headers?.['user-agent'],
        metadata: {
            method: 'password'
        }
    });
}

/**
 * Login failed
 */
async function logLoginFailed(email, req, reason = 'invalid_credentials') {
    return logSecurityEvent({
        userId: null,
        email,
        action: 'login_failed',
        status: 'failure',
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0],
        userAgent: req?.headers?.['user-agent'],
        metadata: { reason }
    });
}

/**
 * Logout
 */
async function logLogout(user, req) {
    return logSecurityEvent({
        userId: user?._id,
        action: 'logout',
        status: 'success',
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        metadata: {}
    });
}

/**
 * Get audit logs for specific user
 */
async function getUserAuditLogs(userId, limitOrPage = 50, limit = null) {
    try {
        // ถ้าส่ง 2 parameters = pagination mode
        if (limit !== null) {
            const page = limitOrPage;
            return await SecurityAudit.getUserLogs(userId, page, limit);
        }
        
        // ถ้าส่ง 1 parameter = simple limit mode (สำหรับ API)
        const logs = await SecurityAudit.find({ userId })
            .sort({ createdAt: -1 })
            .limit(limitOrPage)
            .lean();
        
        return logs;
    } catch (error) {
        logger.error('Get user audit logs error:', error);
        throw error;
    }
}

/**
 * Password changed
 */
async function logPasswordChanged(user, req) {
    return logSecurityEvent({
        userId: user._id,
        email: user.email,
        action: 'password_changed',
        status: 'success',
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        metadata: {}
    });
}

/**
 * Password reset requested
 */
async function logPasswordResetRequested(email, req) {
    return logSecurityEvent({
        userId: null,
        email,
        action: 'password_reset_requested',
        status: 'success',
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        metadata: {}
    });
}

/**
 * Password reset completed
 */
async function logPasswordResetCompleted(user, req) {
    return logSecurityEvent({
        userId: user._id,
        email: user.email,
        action: 'password_reset_completed',
        status: 'success',
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        metadata: {}
    });
}

/**
 * Account locked
 */
async function logAccountLocked(user, req, reason) {
    return logSecurityEvent({
        userId: user._id,
        email: user.email,
        action: 'account_locked',
        status: 'failure',
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        metadata: { reason }
    });
}



/**
 * Get recent failed logins
 */
async function getRecentFailedLogins(userId, minutes = 30) {
    return await SecurityAudit.getRecentFailedLogins(userId, minutes);
}

module.exports = {
    logSecurityEvent,
    logLoginSuccess,
    logLoginFailed,
    logLogout,
    logPasswordChanged,
    logPasswordResetRequested,
    logPasswordResetCompleted,
    logAccountLocked,
    getUserAuditLogs,
    getRecentFailedLogins,
   
};
