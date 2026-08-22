const config = require('../config/config');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const safeAuthUrl = escapeHtml(config.AUTH_SERVER_URL);
const safeFromAddress = escapeHtml(config.email.fromAddress);

const baseLayout = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Global Authen</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f4f6f9; color: #333; }
    .wrapper { max-width: 600px; margin: 40px auto; padding: 0 16px; }
    .card { background: #fff; border-radius: 12px;
            box-shadow: 0 2px 12px rgba(0,0,0,.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #667eea, #764ba2);
              padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 24px; font-weight: 700; }
    .header p  { color: rgba(255,255,255,.85); margin-top: 6px; font-size: 14px; }
    .body { padding: 40px; }
    .body h2 { font-size: 20px; margin-bottom: 12px; }
    .body p  { color: #555; line-height: 1.7; margin-bottom: 16px; }
    .btn { display: inline-block; padding: 14px 32px; background: #667eea;
           color: #fff !important; text-decoration: none; border-radius: 8px;
           font-weight: 600; font-size: 15px; margin: 8px 0; }
    .divider { border: none; border-top: 1px solid #eee; margin: 24px 0; }
    .note { background: #f8f9ff; border-left: 4px solid #667eea;
            padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #666; }
    .footer { padding: 24px 40px; text-align: center; font-size: 12px; color: #999; }
    .footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>🔐 Auth System </h1>
        <p>Secure Authentication System</p>
      </div>
      <div class="body">${content}</div>
      <div class="footer">
        <p>© ${new Date().getFullYear()}  Auth System. All rights reserved.</p>
        <p style="margin-top:6px">
          <a href="${safeAuthUrl}/privacy-policy.html">Terms & Privacy</a>
          &nbsp;·&nbsp;
          <a href="mailto:${safeFromAddress}">Contact Support</a>
        </p>
        <p style="margin-top:10px;font-size:11px;color:#bbb">
          This is an automated email. Please do not reply.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;

const getPasswordResetTemplate = ({ username, resetUrl }) =>
  (() => {
    const safeUsername = escapeHtml(username);
    const safeResetUrl = escapeHtml(resetUrl);
    return baseLayout(`
    <h2>Reset Your Password</h2>
    <p>Hi <strong>${safeUsername}</strong>,</p>
    <p>We received a request to reset the password for your account.
       Click the button below to set a new password.</p>

    <div style="text-align:center; margin: 32px 0;">
      <a href="${safeResetUrl}" class="btn">🔐 Reset Password</a>
    </div>

    <div class="note">
      ⏱️ This link will expire in <strong>1 hour</strong>.<br />
      If you did not request a password reset, you can safely ignore this email.
    </div>

    <hr class="divider" />

    <p style="font-size:13px;color:#888">
      If the button above doesn't work, copy and paste this URL into your browser:<br />
      <a href="${safeResetUrl}" style="color:#667eea;word-break:break-all">${safeResetUrl}</a>
    </p>
  `);
  })();

const getWelcomeTemplate = ({ username }) =>
  (() => {
    const safeUsername = escapeHtml(username);
    return baseLayout(`
    <h2>Welcome to Auth System! 🎉</h2>
    <p>Hi <strong>${safeUsername}</strong>,</p>
    <p>Your account has been created successfully.
       You can now log in and start using the platform.</p>

    <div style="text-align:center; margin: 32px 0;">
      <a href="${safeAuthUrl}/login.html" class="btn">
        🚀 Go to Login
      </a>
    </div>

    <hr class="divider" />

    <p style="font-size:13px;color:#888">
      If you did not create this account, please contact us at
      <a href="mailto:${safeFromAddress}" style="color:#667eea">
        ${safeFromAddress}
      </a>
    </p>
  `);
  })();

const getPasswordChangedTemplate = ({ username }) =>
  (() => {
    const safeUsername = escapeHtml(username);
    return baseLayout(`
    <h2>Password Changed 🔒</h2>
    <p>Hi <strong>${safeUsername}</strong>,</p>
    <p>Your account password was changed on
       <strong>${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })}</strong>.
    </p>

    <div class="note">
      ⚠️ If you did not make this change, please
      <a href="${safeAuthUrl}/login.html" style="color:#667eea">
        log in immediately
      </a>
      and reset your password, or contact us at
      <a href="mailto:${safeFromAddress}" style="color:#667eea">
        ${safeFromAddress}
      </a>
    </div>
  `);
  })();

module.exports = {
  getPasswordResetTemplate,
  getWelcomeTemplate,
  getPasswordChangedTemplate,
};
