const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const config = require('../config/config');

// ─── สร้าง Transporter ───────────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({  //
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: {
      user: config.email.smtp.user,
      pass: config.email.smtp.pass,
    },
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
  });
};

let transporter = createTransporter();

// ─── Verify Connection (เรียกตอน startup) ────────────────────────────────────
const verifyConnection = async () => {
  try {
    await transporter.verify();
    logger.info('✅ Email service connected');
    return true;
  } catch (error) {
    logger.error('❌ Email service connection failed:', error.message);
    return false;
  }
};

// ─── Send Email (core function) ───────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text }) => {
  const mailOptions = {
    from: `"${config.email.fromName}" <${config.email.fromAddress}>`,
    to,
    subject,
    html,
    text: text || stripHtml(html), // fallback plain text
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`📨 Email sent to ${to} — MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`❌ Failed to send email to ${to}:`, error.message);
    throw new Error('Failed to send email');
  }
};

// ─── Helper: Strip HTML tags ──────────────────────────────────────────────────
const stripHtml = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// ─── Email Functions ──────────────────────────────────────────────────────────

/**
 * ส่ง Reset Password Email
 */
const sendPasswordResetEmail = async ({ to, username, resetToken, resetUrl }) => {
  const subject = '🔐 Reset Your Password — ShopHub';
  const html = getPasswordResetTemplate({ username, resetUrl });

  return sendEmail({ to, subject, html });
};

/**
 * ส่ง Welcome Email (หลัง register)
 */
const sendWelcomeEmail = async ({ to, username }) => {
  const subject = '🎉 Welcome to ShopHub!';
  const html = getWelcomeTemplate({ username });

  return sendEmail({ to, subject, html });
};

/**
 * ส่ง Password Changed Notification
 */
const sendPasswordChangedEmail = async ({ to, username }) => {
  const subject = '🔒 Your Password Has Been Changed';
  const html = getPasswordChangedTemplate({ username });

  return sendEmail({ to, subject, html });
};

const {
  getPasswordResetTemplate,
  getWelcomeTemplate,
  getPasswordChangedTemplate,
} = require('./email.templates');


module.exports = {
  verifyConnection,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
};

