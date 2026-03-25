/**
 * API Integration Tests
 * Tests actual HTTP endpoints
 * Run: node tests/api-integration.test.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║           API INTEGRATION TESTS                          ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port || 5000,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data ? JSON.parse(data) : null
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                }
            });
        });

        req.on('error', reject);
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        
        req.end();
    });
}

async function test(description, fn) {
    try {
        await fn();
        console.log(`✅ PASS: ${description}`);
        passed++;
    } catch (error) {
        console.log(`❌ FAIL: ${description}`);
        console.log(`   Error: ${error.message}`);
        if (error.code === 'ECONNREFUSED') {
            console.log('   💡 Make sure the server is running: npm start');
            process.exit(1);
        }
        failed++;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// API TESTS
// ────────────────────────────────────────────────────────────────────────────

async function runTests() {
    // Check if server is running first
    try {
        await request('GET', '/health');
    } catch (error) {
        console.log('\n⚠️  Server is not running or not reachable!');
        console.log('💡 Start the server first: npm start');
        console.log('💡 Make sure MongoDB is running\n');
        process.exit(1);
    }

    // Health check
    await test('GET /health returns OK', async () => {
        const res = await request('GET', '/health');
        if (res.statusCode !== 200) throw new Error(`Status: ${res.statusCode}`);
        if (res.body.status !== 'OK') throw new Error('Not OK status');
    });

    // Swagger docs
    await test('GET /api-docs returns Swagger UI', async () => {
        const res = await request('GET', '/api-docs/');
        if (res.statusCode !== 200 && res.statusCode !== 301) throw new Error(`Status: ${res.statusCode}`);
    });

    // Register with weak password
    await test('POST /api/auth/register - rejects weak password', async () => {
        const res = await request('POST', '/api/auth/register', {
            username: 'testuser',
            email: 'test@example.com',
            password: 'weak',
            consentEssential: true
        });
        if (res.statusCode !== 400) throw new Error(`Status: ${res.statusCode}`);
        if (res.body.error !== 'WEAK_PASSWORD') throw new Error('Wrong error');
    });

    // Register with strong password
    const testEmail = `test_${Date.now()}@example.com`;
    let registerToken;
    
    await test('POST /api/auth/register - accepts strong password', async () => {
        const res = await request('POST', '/api/auth/register', {
            username: 'testuser',
            email: testEmail,
            password: 'Secur3P@ssw0rd!',
            consentEssential: true,
            consentAnalytics: false
        });
        if (res.statusCode !== 201) throw new Error(`Status: ${res.statusCode} - ${JSON.stringify(res.body)}`);
        if (!res.body.success) throw new Error('Not successful');
        registerToken = res.body.data.token;
    });

    // Register duplicate
    await test('POST /api/auth/register - rejects duplicate email', async () => {
        const res = await request('POST', '/api/auth/register', {
            username: 'testuser2',
            email: testEmail,
            password: 'Secur3P@ssw0rd!',
            consentEssential: true
        });
        if (res.statusCode !== 400) throw new Error(`Status: ${res.statusCode}`);
    });

    // Login with wrong password
    await test('POST /api/auth/login - rejects wrong password', async () => {
        const res = await request('POST', '/api/auth/login', {
            email: testEmail,
            password: 'WrongPass123!'
        });
        if (res.statusCode !== 401) throw new Error(`Status: ${res.statusCode}`);
    });

    // Login with correct password
    let loginToken;
    await test('POST /api/auth/login - accepts correct credentials', async () => {
        const res = await request('POST', '/api/auth/login', {
            email: testEmail,
            password: 'Secur3P@ssw0rd!'
        });
        if (res.statusCode !== 200) throw new Error(`Status: ${res.statusCode} - ${JSON.stringify(res.body)}`);
        if (!res.body.success) throw new Error('Not successful');
        loginToken = res.body.data.token;
    });

    // Validate token
    await test('POST /api/auth/validate-token - validates token', async () => {
        const res = await request('POST', '/api/auth/validate-token', {
            token: loginToken
        });
        if (res.statusCode !== 200) throw new Error(`Status: ${res.statusCode}`);
        if (!res.body.valid) throw new Error('Token not valid');
    });

    // Get user info
    await test('GET /api/users/me - returns user info', async () => {
        const res = await request('GET', '/api/users/me', null, {
            'Authorization': `Bearer ${loginToken}`
        });
        if (res.statusCode !== 200) throw new Error(`Status: ${res.statusCode}`);
        if (!res.body.success) throw new Error('Not successful');
        if (!res.body.user.email) throw new Error('No email');
    });

    // Get audit logs
    await test('GET /api/auth/audit-logs - returns audit logs', async () => {
        const res = await request('GET', '/api/auth/audit-logs', null, {
            'Authorization': `Bearer ${loginToken}`
        });
        if (res.statusCode !== 200) throw new Error(`Status: ${res.statusCode}`);
        if (!res.body.success) throw new Error('Not successful');
    });

    // Change password - wrong current password
    await test('POST /api/auth/change-password - rejects wrong current password', async () => {
        const res = await request('POST', '/api/auth/change-password', {
            currentPassword: 'WrongPass123!',
            newPassword: 'NewSecur3P@ssw0rd!'
        }, {
            'Authorization': `Bearer ${loginToken}`
        });
        if (res.statusCode !== 401) throw new Error(`Status: ${res.statusCode}`);
    });

    // Change password - weak new password
    await test('POST /api/auth/change-password - rejects weak new password', async () => {
        const res = await request('POST', '/api/auth/change-password', {
            currentPassword: 'Secur3P@ssw0rd!',
            newPassword: 'weak'
        }, {
            'Authorization': `Bearer ${loginToken}`
        });
        if (res.statusCode !== 400) throw new Error(`Status: ${res.statusCode}`);
        if (res.body.error !== 'WEAK_PASSWORD') throw new Error('Wrong error');
    });

    // Change password - success
    await test('POST /api/auth/change-password - accepts strong new password', async () => {
        const res = await request('POST', '/api/auth/change-password', {
            currentPassword: 'Secur3P@ssw0rd!',
            newPassword: 'NewSecur3P@ssw0rd!'
        }, {
            'Authorization': `Bearer ${loginToken}`
        });
        if (res.statusCode !== 200) throw new Error(`Status: ${res.statusCode} - ${JSON.stringify(res.body)}`);
        if (!res.body.success) throw new Error('Not successful');
    });

    // Login with new password
    await test('POST /api/auth/login - works with new password', async () => {
        const res = await request('POST', '/api/auth/login', {
            email: testEmail,
            password: 'NewSecur3P@ssw0rd!'
        });
        if (res.statusCode !== 200) throw new Error(`Status: ${res.statusCode}`);
        if (!res.body.success) throw new Error('Not successful');
        loginToken = res.body.data.token;
    });

    // Resend verification email
    await test('POST /api/auth/resend-verification - sends verification email', async () => {
        const res = await request('POST', '/api/auth/resend-verification', {
            email: testEmail
        });
        if (res.statusCode !== 200) throw new Error(`Status: ${res.statusCode}`);
        if (!res.body.success) throw new Error('Not successful');
    });

    // Logout
    await test('POST /api/auth/logout - logs out user', async () => {
        const res = await request('POST', '/api/auth/logout', null, {
            'Authorization': `Bearer ${loginToken}`
        });
        if (res.statusCode !== 200) throw new Error(`Status: ${res.statusCode}`);
        if (!res.body.success) throw new Error('Not successful');
    });

    // Access protected route without token
    await test('GET /api/users/me - rejects without token', async () => {
        const res = await request('GET', '/api/users/me');
        if (res.statusCode !== 403) throw new Error(`Status: ${res.statusCode}`);
    });

    // Access protected route with invalid token
    await test('GET /api/users/me - rejects invalid token', async () => {
        const res = await request('GET', '/api/users/me', null, {
            'Authorization': 'Bearer invalid_token'
        });
        if (res.statusCode !== 401) throw new Error(`Status: ${res.statusCode}`);
    });

    // Test account lockout - 5 failed attempts
    const lockEmail = `lock_${Date.now()}@example.com`;
    
    await test('POST /api/auth/register - create user for lockout test', async () => {
        const res = await request('POST', '/api/auth/register', {
            username: 'locktest',
            email: lockEmail,
            password: 'Secur3P@ssw0rd!',
            consentEssential: true
        });
        if (res.statusCode !== 201) throw new Error(`Status: ${res.statusCode}`);
    });

    await test('POST /api/auth/login - 5 failed attempts locks account', async () => {
        // Try 5 failed logins
        for (let i = 0; i < 5; i++) {
            await request('POST', '/api/auth/login', {
                email: lockEmail,
                password: 'WrongPass'
            });
        }
        
        // 6th attempt should be locked
        const res = await request('POST', '/api/auth/login', {
            email: lockEmail,
            password: 'Secur3P@ssw0rd!'
        });
        
        if (res.statusCode !== 423 && res.statusCode !== 401) {
            throw new Error(`Expected 423 or 401, got ${res.statusCode}`);
        }
    });

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  ✅ Passed: ${passed.toString().padEnd(43)} ║`);
    console.log(`║  ❌ Failed: ${failed.toString().padEnd(43)} ║`);
    console.log(`║  📊 Total:  ${(passed + failed).toString().padEnd(42)} ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    if (failed > 0) {
        console.log('⚠️  Some tests failed. Please review the errors above.\n');
        process.exit(1);
    } else {
        console.log('🎉 All API tests passed!\n');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
