// src/modules/auth/controllers/session.controller.js

const sessionService = require('../../../shared/services/session.service');
const logger = require('../../../shared/utils/logger');
const securityAuditService = require('../../../shared/services/securityAudit.service');

// ดึงรายการ session ที่ active ทั้งหมดของ user ปัจจุบัน
exports.getSessions = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const currentSessionId = req.authSession?.sessionId;

        const result = await sessionService.getUserSessions(userId, currentSessionId);

        logger.info('getSessions: active sessions fetched', {
            function: 'getSessions',
            userId,
            count: result.count,
            currentSessionId
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('getSessions failed', { function: 'getSessions', error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get sessions'
        });
    }
};

// ยกเลิก session ที่ระบุ
exports.revokeSession = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const { sessionId } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const result = await sessionService.revokeSession(sessionId, userId, 'user_logout');

        logger.security('revokeSession: session terminated by user', {
            function: 'revokeSession',
            userId,
            sessionId,
            ip: req.ip
        });

        await securityAuditService.logSecurityEvent({
            userId,
            action: 'token_revoked',
            status: 'success',
            ipAddress: req.ip,
            metadata: { sessionId, reason: 'user_logout', function: 'revokeSession' }
        });

        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        logger.error('revokeSession failed', { function: 'revokeSession', error: error.message, sessionId: req.params?.sessionId, userId: req.user?.id });

        if (error.message === 'Session not found') {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to revoke session'
        });
    }
};

// ยกเลิก session ทั้งหมดยกเว้น session ปัจจุบัน
exports.revokeAllOtherSessions = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const currentSessionId = req.authSession?.sessionId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        if (!currentSessionId) {
            logger.warn('No session found for user attempting to revoke sessions:', userId);
            return res.status(400).json({
                success: false,
                error: 'Current session not found',
                message: 'Your current login session was not tracked. Please logout and login again to enable session management.',
                code: 'NO_SESSION_TRACKING'
            });
        }

        const result = await sessionService.revokeAllOtherSessions(userId, currentSessionId, 'user_logout');

        logger.security('revokeAllOtherSessions: all other sessions revoked', {
            function: 'revokeAllOtherSessions',
            userId,
            keptSessionId: currentSessionId,
            ip: req.ip
        });

        await securityAuditService.logSecurityEvent({
            userId,
            action: 'token_revoked',
            status: 'success',
            ipAddress: req.ip,
            metadata: { action: 'revoke_all_other_sessions', keptSessionId: currentSessionId }
        });

        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        logger.error('revokeAllOtherSessions failed', { function: 'revokeAllOtherSessions', error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            error: 'Failed to revoke sessions'
        });
    }
};

// ยกเลิก session ทั้งหมดรวมถึง session ปัจจุบัน (logout ทุกอุปกรณ์)
exports.revokeAllSessions = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const result = await sessionService.revokeAllSessions(userId, 'user_logout');

        await securityAuditService.logSecurityEvent({
            userId,
            action: 'logout',
            status: 'success',
            ipAddress: req.ip,
            metadata: { action: 'logout_everywhere' }
        });

        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        logger.error('Revoke all sessions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to revoke sessions'
        });
    }
};

// ดึงจำนวน session ที่ active ของ user
exports.getSessionCount = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const count = await sessionService.getSessionCount(userId);

        res.json({
            success: true,
            data: { count }
        });
    } catch (error) {
        logger.error('Get session count error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get session count'
        });
    }
};
