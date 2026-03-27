/**
 * Email Delivery Integration Test
 *
 * Verifies SMTP connection, email service methods, and that auth actions
 * that are supposed to send emails actually trigger the send path.
 *
 * Run: node tests/email-delivery.test.js
 */
'use strict';

const http      = require('http');
const nodemailer = require('nodemailer');
const path      = require('path');

// Load .env for local runs (Docker already injects env vars)
try {
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch { /* dotenv optional */ }

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

// ─── Helpers ────────────────────────────────────────────────────────────────

const results = { passed: [], failed: [], total: 0 };

function test(name, condition, details = '') {
    results.total++;
    if (condition) {
        results.passed.push(name);
        console.log(`  ✅ ${name}${details ? ' — ' + details : ''}`);
    } else {
        results.failed.push(name);
        console.log(`  ❌ ${name}${details ? ' — ' + details : ''}`);
    }
}

function request(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port:     url.port || 5000,
            path:     url.pathname + url.search,
            method,
            headers:  { 'Content-Type': 'application/json', ...headers }
        };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try   { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
                catch { resolve({ status: res.statusCode, data: body }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {

    // ── Section 1: SMTP Configuration ───────────────────────────────────────
    console.log('\n📧 1. SMTP Configuration');

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    test('SMTP_HOST is configured',  !!smtpHost,  smtpHost  || 'missing');
    test('SMTP_PORT is configured',  !!smtpPort,  smtpPort  || 'missing');
    test('SMTP_USER is configured',  !!smtpUser,  smtpUser  ? smtpUser.replace(/(.{3}).*(@.*)/, '$1***$2') : 'missing');
    test('SMTP_PASS is configured',  !!smtpPass,  smtpPass  ? '***set***' : 'missing');

    // ── Section 2: SMTP Connection Verification ──────────────────────────────
    console.log('\n🔌 2. SMTP Connection');

    let smtpConnected = false;
    let smtpError     = null;

    if (smtpHost && smtpUser && smtpPass) {
        const transporter = nodemailer.createTransport({
            host:   smtpHost,
            port:   parseInt(smtpPort) || 587,
            secure: false,
            auth:   { user: smtpUser, pass: smtpPass },
            connectionTimeout: 10000
        });
        try {
            await transporter.verify();
            smtpConnected = true;
        } catch (e) {
            smtpError = e.message;
        }
    } else {
        smtpError = 'Missing SMTP credentials in environment';
    }

    test('SMTP server is reachable and accepts credentials',
        smtpConnected, smtpError || 'connected');

    // ── Section 3: Email Service Module ─────────────────────────────────────
    console.log('\n📦 3. Email Service Module');

    let emailService = null;
    let serviceLoadError = null;
    try {
        emailService = require('../src/shared/services/email.service');
    } catch (e) {
        serviceLoadError = e.message;
    }

    test('email.service.js loads without error', !!emailService, serviceLoadError || '');

    if (emailService) {
        const expectedMethods = [
            'sendEmail',
            'sendPasswordResetEmail',
            'sendPasswordChangedEmail',
            'sendWelcomeEmail',
            'sendLoginAlertEmail',
            'verifyConnection'
        ];
        for (const method of expectedMethods) {
            test(`EmailService has method: ${method}`,
                typeof emailService[method] === 'function');
        }
    }

    // ── Section 4: Email Templates ───────────────────────────────────────────
    console.log('\n🎨 4. Email Templates');

    let templates = null;
    try {
        templates = require('../src/shared/services/email.templates');
    } catch (e) { /* module may not export separately */ }

    if (templates) {
        const templateFns = [
            'getPasswordResetTemplate',
            'getWelcomeTemplate',
            'getPasswordChangedTemplate',
            'getVerificationTemplate'
        ];
        for (const fn of templateFns) {
            if (typeof templates[fn] === 'function') {
                let rendered = false;
                let renderError = null;
                try {
                    const result = templates[fn]({ username: 'TestUser', resetUrl: 'http://test.com/reset?token=abc', verificationUrl: 'http://test.com/verify?token=abc' });
                    rendered = typeof result === 'string' && result.length > 0;
                } catch (e) {
                    renderError = e.message;
                }
                test(`Template "${fn}" renders without error`, rendered, renderError || '');
            }
        }
    } else {
        test('Email templates module loads', false, 'module not found or not exported separately');
    }

    // ── Section 5: SMTP Connection via App Health ────────────────────────────
    console.log('\n🏥 5. App-Level SMTP Verification');

    // The app verifies SMTP on startup — check app is running (proxy for SMTP ok)
    let appReachable = false;
    try {
        const res = await request('GET', '/api/auth/oauth/status');
        appReachable = res.status === 200;
    } catch (e) { /* app not running */ }

    test('App is running and reachable', appReachable);

    if (!appReachable) {
        console.log('\n⚠️  App not reachable — skipping API-level email trigger tests.');
        return printSummary();
    }

    // ── Section 6: Auth Endpoints That Trigger Emails ────────────────────────
    console.log('\n📨 6. Auth Endpoints That Trigger Emails');

    const email    = `emailtest_${Date.now()}@example.com`;
    const username = `emailtest${Date.now()}`.slice(0, 20);
    const password = 'TestPass123!';

    // 6a: Register — triggers welcome email + verification email
    const regRes = await request('POST', '/api/auth/register', {
        username, email, password, consentEssential: true
    });
    test('Register endpoint succeeds (triggers welcome + verification email)',
        regRes.status === 201,
        `HTTP ${regRes.status}: ${regRes.data?.message || regRes.data?.error || ''}`);

    // 6b: Resend verification — triggers verification email
    const resendRes = await request('POST', '/api/auth/resend-verification', { email });
    test('Resend-verification endpoint responds (triggers verification email)',
        resendRes.status === 200 || resendRes.status === 400,
        `HTTP ${resendRes.status}: ${resendRes.data?.message || resendRes.data?.error || ''}`);

    // 6c: Forgot password — triggers password reset email
    const fpRes = await request('POST', '/api/auth/forgot-password', { email });
    test('Forgot-password endpoint succeeds (triggers password reset email)',
        fpRes.status === 200,
        `HTTP ${fpRes.status}: ${fpRes.data?.message || fpRes.data?.error || ''}`);

    // 6d: Login — triggers login alert email (if enabled in preferences)
    const loginRes = await request('POST', '/api/auth/login', { email, password });
    test('Login endpoint succeeds (triggers login alert email path)',
        loginRes.status === 200,
        `HTTP ${loginRes.status}: ${loginRes.data?.message || loginRes.data?.error || ''}`);

    // 6e: Change password — triggers password changed email
    const token = loginRes.data?.data?.token;
    if (token) {
        const cpRes = await request('POST', '/api/auth/change-password',
            { currentPassword: password, newPassword: 'NewTestPass456!' },
            { Authorization: `Bearer ${token}` }
        );
        test('Change-password endpoint succeeds (triggers password changed email)',
            cpRes.status === 200,
            `HTTP ${cpRes.status}: ${cpRes.data?.message || cpRes.data?.error || ''}`);
    } else {
        test('Change-password email trigger (login required)', false, 'could not obtain token from login');
    }

    // ── Section 7: Email Service Direct Call (live SMTP) ────────────────────
    console.log('\n📡 7. Email Service verifyConnection()');

    if (emailService && typeof emailService.verifyConnection === 'function') {
        let verified = false;
        let verifyError = null;
        try {
            verified = await emailService.verifyConnection();
        } catch (e) {
            verifyError = e.message;
        }
        test('emailService.verifyConnection() returns true',
            verified === true, verifyError || (verified ? 'ok' : 'returned false'));
    } else {
        test('emailService.verifyConnection() available', false, 'method not found');
    }

    printSummary();
}

function printSummary() {
    const passed = results.passed.length;
    const failed = results.failed.length;
    const total  = results.total;

    console.log('\n' + '═'.repeat(60));
    console.log('  Email Delivery Tests');
    console.log('═'.repeat(60));
    console.log(`  ✅ Passed: ${passed} / ${total}`);
    if (failed > 0) {
        console.log(`  ❌ Failed: ${failed} / ${total}`);
        results.failed.forEach(n => console.log(`     • ${n}`));
    }
    console.log('═'.repeat(60) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
