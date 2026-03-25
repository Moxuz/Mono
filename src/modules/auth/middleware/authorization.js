/**
 * Authorization Middleware
 * Check user roles and permissions
 */

/**
 * Middleware to check if user has required role
 * Usage: authorizeRole('admin'), authorizeRole('admin', 'user')
 */
function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${roles.join(' or ')}`
            });
        }

        next();
    };
}

/**
 * Middleware to check if user is admin
 */
function isAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authenticated'
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin role required.'
        });
    }

    next();
}

/**
 * Middleware to check if user owns the resource
 */
function isOwner(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authenticated'
        });
    }

    const userId = req.params.userId || req.body.userId;

    if (req.user.role === 'admin' || req.user.id === userId) {
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own resources.'
    });
}

module.exports = {
    authorizeRole,
    isAdmin,
    isOwner
};
