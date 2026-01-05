const jwt = require('jsonwebtoken');
const config = require('../../../shared/config/config');
const User = require('../../../shared/models/User');

exports.authenticate = async (req, res, next) => {
    try {
        // Get token from header
        let token = req.headers['authorization'] || req.query.token;
        
        if (!token) {
            return res.status(403).json({
                success: false,
                message: 'No token provided'
            });
        }

        // Remove Bearer from token
        if (token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        // Verify token
        const decoded = jwt.verify(token, config.JWT_SECRET);
        
        // Get user from token
        const user = await User.findById(decoded.id);
        
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive'
            });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        next();
    };
};
