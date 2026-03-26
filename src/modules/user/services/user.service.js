const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const logger = require('../../../shared/utils/logger');
const securityAuditService = require('../../../shared/services/securityAudit.service');

/**
 * Get user by ID
 */
async function getUserById(userId) {
    try {
        const user = await User.findById(userId);
        
        if (!user) {
            throw new Error('User not found');
        }

        logger.info(`User retrieved: ${user.email}`);

        return {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
    } catch (error) {
        logger.error('Get user failed:', error.message);
        throw error;
    }
}

/**
 * Update user profile
 */
async function updateUser(userId, updateData) {
    try {
        const user = await User.findById(userId);
        
        if (!user) {
            throw new Error('User not found');
        }

        // Allowed fields for update
        const allowedFields = ['username', 'email'];
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                user[field] = updateData[field];
            }
        });

        await user.save();

        logger.info(`User updated: ${user.email}`);

        return {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role
        };
    } catch (error) {
        logger.error('Update user failed:', error.message);
        throw error;
    }
}

/**
 * Delete user account (Right to Erasure - PDPA Section 42)
 */
async function deleteUser(userId, reason = 'user_request') {
    try {
        const user = await User.findById(userId);
        
        if (!user) {
            throw new Error('User not found');
        }

        logger.warn(`User deletion requested: ${user.email} (reason: ${reason})`);

        // Revoke all sessions first
        await Session.revokeAllSessions(userId, 'account_deleted');

        // Log security event before deletion
        await securityAuditService.logSecurityEvent({
            userId,
            action: 'account_deactivated',
            status: 'success',
            metadata: {
                email: user.email,
                reason,
                deletedAt: new Date().toISOString()
            }
        });

        // Soft delete: Mark as inactive instead of hard delete
        // This preserves audit trail while preventing access
        user.isActive = false;
        user.email = `deleted_${Date.now()}_${user.email}`; // Anonymize email
        user.username = `Deleted User ${user._id.toString().slice(-6)}`; // Anonymize username
        
        // Clear personal data but keep audit-relevant info
        user.password = undefined;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        // Keep PDPA consent record for compliance
        user.pdpaConsent = {
            ...user.pdpaConsent,
            accountDeletedAt: new Date(),
            accountDeleteReason: reason
        };

        await user.save();

        logger.info(`User account deactivated and anonymized: ${user.email}`);

        return {
            success: true,
            message: 'Account deleted successfully',
            deletedAt: new Date().toISOString()
        };
    } catch (error) {
        logger.error('Delete user failed:', error.message);
        throw error;
    }
}

/**
 * Export user data (Right to Data Portability - PDPA Section 41)
 */
async function exportUserData(userId) {
    try {
        const user = await User.findById(userId);
        
        if (!user) {
            throw new Error('User not found');
        }

        logger.info(`User data export requested: ${user.email}`);

        // Export all user data in portable format
        const exportData = {
            // Personal Information
            personalInfo: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLogin: user.lastLogin
            },
            // Consent Records
            pdpaConsent: user.pdpaConsent,
            // Account Status
            accountStatus: {
                isActive: user.isActive,
                failedLoginAttempts: user.failedLoginAttempts,
                lockUntil: user.lockUntil
            },
            // Export Metadata
            exportMetadata: {
                exportedAt: new Date().toISOString(),
                format: 'JSON',
                version: '1.0'
            }
        };

        return exportData;
    } catch (error) {
        logger.error('Export user data failed:', error.message);
        throw error;
    }
}

/**
 * Get user sessions
 */
async function getUserSessions(userId) {
    try {
        const sessions = await Session.findActiveSessions(userId);
        
        return {
            sessions: sessions.map(s => ({
                id: s._id,
                deviceInfo: s.deviceInfo,
                ipAddress: s.ipAddress,
                lastActiveAt: s.lastActiveAt,
                createdAt: s.createdAt
            })),
            count: sessions.length
        };
    } catch (error) {
        logger.error('Get user sessions failed:', error.message);
        throw error;
    }
}

module.exports = {
    getUserById,
    updateUser,
    deleteUser,
    exportUserData,
    getUserSessions
};
