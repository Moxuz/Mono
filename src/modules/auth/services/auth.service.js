const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../../shared/models/User');
const config = require('../../../shared/config/config');
const emailService = require('../../../shared/services/email.service'); 
const crypto = require('crypto');

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
                password,           // hashed by pre-save hook
                pdpaConsent         
            });

            await user.save();

               emailService
            .sendWelcomeEmail({ to: user.email, username: user.username })
            .catch((err) => console.error('Welcome email failed:', err.message));

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


     async updateCookieConsent(userId, { cookieConsentAccepted, cookieConsentAt, consentIp }) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            user.pdpaConsent.cookieConsentAccepted = cookieConsentAccepted;
            user.pdpaConsent.cookieConsentAt       = cookieConsentAt;
            user.pdpaConsent.consentIp             = consentIp;

            await user.save();

            return { success: true };
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
        //  เช็คว่ามี token หรือไม่
        if (!token) {
            return { 
                valid: false, 
                error: 'Token is required' 
            };
        }
        
        // Verify JWT
        const decoded = jwt.verify(token, config.JWT_SECRET);
        
        //  เช็คว่า token หมดอายุหรือไม่
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp < now) {
            return { 
                valid: false, 
                error: 'Token has expired' 
            };
        }
        
        return { 
            valid: true, 
            payload: decoded 
        };
        
    } catch (error) {
        // JWT verification errors
        if (error.name === 'TokenExpiredError') {
            return { 
                valid: false, 
                error: 'Token has expired' 
            };
        }
        
        if (error.name === 'JsonWebTokenError') {
            return { 
                valid: false, 
                error: 'Invalid token format' 
            };
        }
        
        return { 
            valid: false, 
            error: error.message 
        };
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
      const user = await User.findOne({ email })
        .select('+passwordResetToken +passwordResetExpires');

      if (!user) {
        return { message: 'If this email exists, a reset link has been sent.' };
      }

      const resetToken  = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

      user.passwordResetToken   = hashedToken;
      user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
      await user.save();

      // ─── Debug ─────────────────────────────────────────────────────────────
      console.log('=== FORGOT PASSWORD DEBUG ===');
      console.log('Raw token     :', resetToken);
      console.log('Hashed token  :', hashedToken);
      console.log('Expires at    :', new Date(user.passwordResetExpires));
      console.log('Saved token   :', user.passwordResetToken);
      console.log('==============================');

      const resetUrl = `${process.env.AUTH_SERVER_URL}/reset-password.html?token=${resetToken}`;
      console.log('Reset URL     :', resetUrl);

      try {
        await emailService.sendPasswordResetEmail({
          to:       user.email,
          username: user.username,
          resetUrl,
        });
      } catch (emailError) {
        user.passwordResetToken   = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        throw new Error('Failed to send reset email. Please try again.');
      }

      return { message: 'If this email exists, a reset link has been sent.' };
    } catch (error) {
      throw error;
    }
  }

  async resetPassword(token, newPassword) {
    try {
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // ─── Debug ─────────────────────────────────────────────────────────────
      console.log('=== RESET PASSWORD DEBUG ===');
      console.log('Token from URL :', token);
      console.log('Hashed token   :', hashedToken);
      console.log('Current time   :', new Date());

      // ─── เช็ค DB ตรงๆ ก่อน ──────────────────────────────────────────────
      const userCheck = await User.findOne({
        passwordResetToken: hashedToken
      }).select('+passwordResetToken +passwordResetExpires');

      console.log('User by token  :', userCheck ? userCheck.email : 'NOT FOUND');
      if (userCheck) {
        console.log('Token in DB    :', userCheck.passwordResetToken);
        console.log('Expires at     :', userCheck.passwordResetExpires);
        console.log('Is expired     :', userCheck.passwordResetExpires < Date.now());
      }
      console.log('============================');

      const user = await User.findOne({
        passwordResetToken:   hashedToken,
        passwordResetExpires: { $gt: Date.now() },
      }).select('+password +passwordResetToken +passwordResetExpires');

      if (!user) {
        throw new Error('Invalid or expired reset token');
      }

      user.password             = newPassword;
      user.passwordResetToken   = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      emailService
        .sendPasswordChangedEmail({ to: user.email, username: user.username })
        .catch((err) => console.error('Password changed email failed:', err.message));

      return { message: 'Password reset successful' };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new AuthService();