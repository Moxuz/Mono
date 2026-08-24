const User = require('../../../shared/models/User');
const Session = require('../../../shared/models/Session');
const Consent = require('../../../shared/models/Consent');
const Client = require('../../../shared/models/Client');
const TokenBlacklist = require('../../../shared/models/TokenBlacklist');
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
            displayName: user.displayName || '',
            bio: user.bio || '',
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
        // Login identifiers are immutable through the self-service profile
        // endpoint. Changing them needs a separate verified workflow.
        const allowedFields = ['displayName', 'bio'];
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
            role: user.role,
            displayName: user.displayName || '',
            bio: user.bio || ''
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

        const originalEmail = user.email;
        logger.warn(`User deletion requested: ${originalEmail} (reason: ${reason})`);
        const ownedClients = await Client.find({ owner: userId })
            .select('client_id')
            .lean();

        // Blacklist token hashes before deactivating sessions so old access
        // and refresh tokens cannot become usable if account state changes.
        const activeSessions = await Session.find({ userId, isActive: true });
        for (const session of activeSessions) {
            if (session.accessTokenHash) {
                await TokenBlacklist.revokeByHash(session.accessTokenHash, userId, null, 'account_deleted');
            }
            if (session.refreshTokenHash) {
                await TokenBlacklist.revokeByHash(session.refreshTokenHash, userId, null, 'account_deleted');
            }
        }

        // Revoke all sessions first
        await Session.revokeAllSessions(userId, 'account_deleted');
        await Consent.revokeAllForUser(userId, 'account_deleted');
        await Promise.all(ownedClients.map(client =>
            Consent.revokeAllForClient(client.client_id, 'owner_account_deleted')
        ));
        await Client.updateMany({ owner: userId, isActive: true }, {
            $set: { isActive: false }
        });

        const deletedAt = new Date();

        // Log security event before deletion
        await securityAuditService.logSecurityEvent({
            userId,
            action: 'account_deactivated',
            status: 'success',
            metadata: {
                reason,
                deletedAt: deletedAt.toISOString()
            }
        });

        // Soft delete: retain only the minimum audit-safe tombstone.
        user.isActive = false;
        user.email = `deleted_${user._id.toString()}@invalid.local`;
        user.username = `deleted_${user._id.toString().slice(-16)}`;
        user.googleId = undefined;
        user.githubId = undefined;
        user.avatar = undefined;
        user.displayName = '';
        user.bio = '';

        // Clear credentials and keep the compliance tombstone.
        user.password = undefined;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        user.pdpaConsent = {
            accountDeletedAt: deletedAt,
            accountDeleteReason: reason
        };

        await user.save();

        // Remove raw identity values from historical audit rows immediately;
        // the user tombstone keeps the userId relation until the retention job
        // permanently removes the deleted account.
        await securityAuditService.redactUserIdentity(userId, originalEmail);

        logger.info(`User account deactivated and anonymized: ${user._id}`);

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

        const [ownedClients, consentRecords, sessionRecords] = await Promise.all([
            Client.find({ owner: userId })
                .select('client_id client_name description logo_uri redirect_uris scope application_type contact_email isActive totalRequests lastUsed createdAt updatedAt')
                .lean(),
            Consent.find({ userId })
                .select('clientId grantId scope grantedAt revokedAt revokeReason expiresAt createdAt updatedAt')
                .lean(),
            Session.find({ userId })
                .select('deviceInfo userAgent ipAddress isActive lastActiveAt revokedAt revokeReason expiresAt createdAt updatedAt')
                .lean()
        ]);

        // Export all user data in portable format
        const exportData = {
            // Personal Information
            personalInfo: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLogin: user.lastLogin,
                displayName: user.displayName || '',
                bio: user.bio || '',
                linkedProviders: {
                    google: Boolean(user.googleId),
                    github: Boolean(user.githubId)
                }
            },
            // Consent Records
            pdpaConsent: user.pdpaConsent,
            oauthClients: ownedClients,
            oauthConsents: consentRecords,
            sessions: sessionRecords,
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
