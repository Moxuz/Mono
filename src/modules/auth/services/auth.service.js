const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../../shared/models/User');
const config = require('../../../shared/config/config');

class AuthService {
    async register({ username, email, password }) {
        try {
            // Check if user exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                throw new Error('User already exists');
            }

            // Create new user
            const user = new User({
                username,
                email,
                password // Will be hashed by pre-save hook
            });

            await user.save();

            // Generate token
            const token = this.createToken(user);

            return {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                token
            };
        } catch (error) {
            throw error;
        }
    }

    async login({ email, password }) {
        try {
            // Find user
            const user = await User.findOne({ email }).select('+password');
            if (!user) {
                throw new Error('Invalid credentials');
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                throw new Error('Invalid credentials');
            }

            // Update last login
            user.lastLogin = new Date();
            await user.save();

            // Generate token
            const token = this.createToken(user);

            return {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                token
            };
        } catch (error) {
            throw error;
        }
    }

    createToken(user) {
        return jwt.sign(
            {
                id: user._id,
                email: user.email,
                role: user.role
            },
            config.JWT_SECRET,
            { expiresIn: config.JWT_EXPIRE || '1h' }
        );
    }

    async validateToken(token) {
        try {
            const decoded = jwt.verify(token, config.JWT_SECRET);
            return { valid: true, payload: decoded };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    async refreshToken(refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, config.JWT_SECRET);
            const user = await User.findById(decoded.id);
            
            if (!user) {
                throw new Error('User not found');
            }

            const newToken = this.createToken(user);
            return { token: newToken };
        } catch (error) {
            throw new Error('Invalid refresh token');
        }
    }

    async forgotPassword(email) {
        try {
            const user = await User.findOne({ email });
            if (!user) {
                throw new Error('User not found');
            }

            // Generate reset token
            const resetToken = jwt.sign(
                { id: user._id },
                config.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // TODO: Send email with reset link
            console.log(`Reset token for ${email}: ${resetToken}`);

            return { message: 'Reset token generated', token: resetToken };
        } catch (error) {
            throw error;
        }
    }

    async resetPassword(token, newPassword) {
        try {
            const decoded = jwt.verify(token, config.JWT_SECRET);
            const user = await User.findById(decoded.id);
            
            if (!user) {
                throw new Error('User not found');
            }

            user.password = newPassword;
            await user.save();

            return { message: 'Password reset successful' };
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    }
}

module.exports = new AuthService();