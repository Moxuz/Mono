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

module.exports = {
    authorizeRole
};
