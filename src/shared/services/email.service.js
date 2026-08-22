const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const config = require('../config/config');

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: config.email.smtp.host,
            port: config.email.smtp.port,
            secure: config.email.smtp.secure,
            auth: {
                user: config.email.smtp.user,
                pass: config.email.smtp.pass,
            },
        });
    }

    /**
     * Verify SMTP connection (ต้องมี method นี้)
     */
    async verifyConnection() {
        try {
            await Promise.race([
                this.transporter.verify(),
                new Promise((_, reject) => {
                    const timer = setTimeout(() => reject(new Error('SMTP verification timed out')), config.email.verifyTimeoutMs);
                    timer.unref?.();
                })
            ]);
            logger.info('SMTP connection verified successfully');
            return true;
        } catch (error) {
            logger.error('SMTP connection failed:', error.message);
            return false;
        }
    }

    /**
     * Send email helper
     */
    async sendEmail({ to, subject, html, text }) {
        try {
            const mailOptions = {
                from: `"${config.email.fromName}" <${config.email.fromAddress || config.email.smtp.user}>`,
                to,
                subject,
                html,
                text: text || '',
            };

            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`Email sent to ${to}: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            logger.error('Email send error:', { to, subject, error: error.message });
            throw new Error('Failed to send email');
        }
    }

    /**
     * ส่ง email reset password
     */
    async sendPasswordResetEmail({ to, username, resetUrl }) {
        const safeUsername = escapeHtml(username);
        const safeResetUrl = escapeHtml(resetUrl);
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        background-color: #f4f4f4;
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        max-width: 600px;
                        margin: 40px auto;
                        background: #ffffff;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .header {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: #ffffff;
                        padding: 30px;
                        text-align: center;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 24px;
                    }
                    .content {
                        padding: 40px 30px;
                    }
                    .button {
                        display: inline-block;
                        padding: 14px 30px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: #ffffff !important;
                        text-decoration: none;
                        border-radius: 5px;
                        font-weight: bold;
                        margin: 20px 0;
                        text-align: center;
                    }
                    .button:hover {
                        opacity: 0.9;
                    }
                    .warning {
                        background-color: #fff3cd;
                        border-left: 4px solid #ffc107;
                        padding: 15px;
                        margin: 20px 0;
                        border-radius: 4px;
                    }
                    .footer {
                        background-color: #f8f9fa;
                        padding: 20px;
                        text-align: center;
                        font-size: 12px;
                        color: #6c757d;
                        border-top: 1px solid #dee2e6;
                    }
                    .link {
                        word-break: break-all;
                        color: #667eea;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 Password Reset Request</h1>
                    </div>
                    <div class="content">
                        <p>Hi <strong>${safeUsername}</strong>,</p>
                        <p>We received a request to reset your password. Click the button below to create a new password:</p>
                        
                        <center>
                            <a href="${safeResetUrl}" class="button">Reset Password</a>
                        </center>
                        
                        <p>Or copy and paste this link in your browser:</p>
                        <p class="link">${safeResetUrl}</p>
                        
                        <div class="warning">
                            <strong>⚠️ Important:</strong>
                            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                                <li>This link will expire in <strong>1 hour</strong></li>
                                <li>If you didn't request this, please ignore this email</li>
                                <li>Your password will remain unchanged</li>
                            </ul>
                        </div>
                        
                        <p style="margin-top: 30px;">Need help? Contact our support team.</p>
                    </div>
                    <div class="footer">
                        <p>This is an automated email, please do not reply.</p>
                        <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const text = `
Hi ${username},

We received a request to reset your password.

Reset your password by clicking this link:
${resetUrl}

⚠️ This link will expire in 1 hour.

If you didn't request this, please ignore this email.

Need help? Contact our support team.
        `.trim();

        return this.sendEmail({
            to,
            subject: '🔐 Reset Your Password',
            html,
            text,
        });
    }

    /**
     * ส่ง email ยืนยันการเปลี่ยนรหัสผ่านสำเร็จ
     */
    async sendPasswordChangedEmail({ to, username }) {
        const safeUsername = escapeHtml(username);
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        background-color: #f4f4f4;
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        max-width: 600px;
                        margin: 40px auto;
                        background: #ffffff;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .header {
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        color: #ffffff;
                        padding: 30px;
                        text-align: center;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 24px;
                    }
                    .content {
                        padding: 40px 30px;
                    }
                    .success-icon {
                        text-align: center;
                        font-size: 60px;
                        margin: 20px 0;
                    }
                    .alert {
                        background-color: #f8d7da;
                        border-left: 4px solid #dc3545;
                        padding: 15px;
                        margin: 20px 0;
                        border-radius: 4px;
                        color: #721c24;
                    }
                    .footer {
                        background-color: #f8f9fa;
                        padding: 20px;
                        text-align: center;
                        font-size: 12px;
                        color: #6c757d;
                        border-top: 1px solid #dee2e6;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✅ Password Changed Successfully</h1>
                    </div>
                    <div class="content">
                        <div class="success-icon">✅</div>
                        
                        <p>Hi <strong>${safeUsername}</strong>,</p>
                        <p>Your password has been successfully changed.</p>
                        
                        <div class="alert">
                            <strong>🔒 Security Notice:</strong><br>
                            If you didn't make this change, please contact our support team <strong>immediately</strong>.
                        </div>
                        
                        <p>For your security:</p>
                        <ul>
                            <li>Never share your password with anyone</li>
                            <li>Use a unique password for each account</li>
                        </ul>
                        
                        <p style="margin-top: 30px;">Stay safe!</p>
                    </div>
                    <div class="footer">
                        <p>This is an automated email, please do not reply.</p>
                        <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const text = `
Hi ${username},

Your password has been successfully changed.

🔒 Security Notice:
If you didn't make this change, please contact our support team immediately.

For your security:
- Never share your password with anyone
- Use a unique password for each account

Stay safe!
        `.trim();

        return this.sendEmail({
            to,
            subject: '✅ Password Changed Successfully',
            html,
            text,
        });
    }

    /**
     * ส่ง welcome email
     */
    async sendWelcomeEmail({ to, username }) {
        const safeUsername = escapeHtml(username);
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        line-height: 1.6; 
                        color: #333; 
                        background-color: #f4f4f4;
                        margin: 0;
                        padding: 0;
                    }
                    .container { 
                        max-width: 600px; 
                        margin: 40px auto; 
                        background: #ffffff;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .header { 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 30px; 
                        text-align: center; 
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 24px;
                    }
                    .content {
                        padding: 40px 30px;
                    }
                    .footer {
                        background-color: #f8f9fa;
                        padding: 20px;
                        text-align: center;
                        font-size: 12px;
                        color: #6c757d;
                        border-top: 1px solid #dee2e6;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to Our Platform! 🎉</h1>
                    </div>
                    <div class="content">
                        <p>Hi <strong>${safeUsername}</strong>,</p>
                        <p>Welcome! Your account has been created successfully.</p>
                        <p>Get started by exploring our features.</p>
                        <p>If you have any questions, feel free to contact our support team.</p>
                    </div>
                    <div class="footer">
                        <p>This is an automated email, please do not reply.</p>
                        <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const text = `
Hi ${username},

Welcome! Your account has been created successfully.

Get started by exploring our features.

If you have any questions, feel free to contact our support team.
        `.trim();

        return this.sendEmail({
            to,
            subject: '🎉 Welcome to Our Platform!',
            html,
            text,
        });
    }

    /**
 * ส่ง email แจ้งเตือนการ login
 */
    async sendLoginAlertEmail({ to, username, deviceInfo, ipAddress, timestamp }) {
      const safeUsername = escapeHtml(username);
      const safeLoginTime = escapeHtml(new Date(timestamp).toLocaleString('en-US', {
        timeZone: 'Asia/Bangkok', dateStyle: 'full', timeStyle: 'long'
      }));
      const safeIpAddress = escapeHtml(ipAddress || 'Unknown');
      const safeDevice = escapeHtml(deviceInfo?.deviceType || 'Unknown');
      const safeBrowser = escapeHtml(deviceInfo?.browser || 'Unknown');
      const safeLocation = escapeHtml(deviceInfo?.location || 'Unknown');
      const loginTime = new Date(timestamp).toLocaleString('en-US', {
        timeZone: 'Asia/Bangkok',
        dateStyle: 'full',
        timeStyle: 'long'
      });

      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                }
                .container {
                    max-width: 600px;
                    margin: 40px auto;
                    background: #ffffff;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #ffffff;
                    padding: 30px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    padding: 40px 30px;
                }
                .info-box {
                    background-color: #f8f9fa;
                    border-left: 4px solid #667eea;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 4px;
                }
                .info-box h3 {
                    margin-top: 0;
                    color: #667eea;
                    font-size: 16px;
                }
                .info-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #e9ecef;
                }
                .info-item:last-child {
                    border-bottom: none;
                }
                .info-label {
                    font-weight: 600;
                    color: #495057;
                }
                .info-value {
                    color: #6c757d;
                    text-align: right;
                }
                .alert {
                    background-color: #fff3cd;
                    border-left: 4px solid #ffc107;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 4px;
                }
                .footer {
                    background-color: #f8f9fa;
                    padding: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #6c757d;
                    border-top: 1px solid #dee2e6;
                }
                .button {
                    display: inline-block;
                    padding: 12px 24px;
                    background-color: #dc3545;
                    color: #ffffff !important;
                    text-decoration: none;
                    border-radius: 4px;
                    margin: 20px 0;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div style="font-size: 48px; margin-bottom: 10px;">🔐</div>
                    <h1>New Login Detected</h1>
                </div>
                <div class="content">
                    <p>Hi <strong>${safeUsername}</strong>,</p>
                    <p>We detected a new login to your account. If this was you, you can safely ignore this email.</p>
                    
                    <div class="info-box">
                        <h3>📍 Login Details</h3>
                        <div class="info-item">
                            <span class="info-label">Time:</span>
                            <span class="info-value">${safeLoginTime}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">IP Address:</span>
                            <span class="info-value">${safeIpAddress}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Device:</span>
                            <span class="info-value">${safeDevice}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Browser:</span>
                            <span class="info-value">${safeBrowser}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Location:</span>
                            <span class="info-value">${safeLocation}</span>
                        </div>
                    </div>

                    <div class="alert">
                        <strong>⚠️ Wasn't you?</strong><br>
                        If you didn't log in at this time, your account may be compromised. Please secure your account immediately:
                        <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                            <li>Change your password immediately</li>
                            <li>Review your active sessions</li>
                        </ul>
                    </div>

                    <center>
                        <a href="${config.AUTH_SERVER_URL}/profile.html?action=changePassword" class="button">
                            Secure My Account
                        </a>
                    </center>

                    <p style="margin-top: 30px; font-size: 14px; color: #6c757d;">
                        You can manage your notification preferences in your <a href="${config.AUTH_SERVER_URL}/settings.html" style="color: #667eea;">account settings</a>.
                    </p>
                </div>
                <div class="footer">
                    <p>This is an automated security alert from AuthSys.</p>
                    <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
      `;

      const text = `
    Hi ${username},

    We detected a new login to your account.

    Login Details:
    - Time: ${loginTime}
    - IP Address: ${ipAddress || 'Unknown'}
    - Device: ${deviceInfo?.deviceType || 'Unknown'}
    - Browser: ${deviceInfo?.browser || 'Unknown'}
    - Location: ${deviceInfo?.location || 'Unknown'}

    ⚠️ Wasn't you?
    If you didn't log in at this time, please secure your account immediately:
    - Change your password
    - Review your active sessions

    Secure your account: ${config.AUTH_SERVER_URL}/profile.html?action=changePassword

    You can manage notification preferences in your account settings.
      `.trim();

      return this.sendEmail({
        to,
        subject: '🔐 New Login Detected on Your Account',
        html,
        text,
      });
    }

}



module.exports = new EmailService();
