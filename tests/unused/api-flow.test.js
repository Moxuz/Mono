/**
 * COMPREHENSIVE API INTEGRATION TESTS
 * Tests all critical authentication flows
 */

const http = require('http');

// Test configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = 'SecureP@ssw0rd123!';
const TEST_USERNAME = 'testuser';

// Test results
const results = {
    passed: [],
    failed: []
};

// Helper: Make HTTP requests
function request(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        data: body ? JSON.parse(body) : null
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        data: body
                    });
                }
            });
        });

        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// Helper: Test assertion
function test(name, condition, details = '') {
    if (condition) {
        results.passed.push({ name, details });
        console.log(`✅ PASS: ${name}`);
        return true;
    } else {
        results.failed.push({ name, details });
        console.log(`❌ FAIL: ${name}`);
        if (details) console.log(`   ${details}`);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────

async function runTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║      COMPREHENSIVE API INTEGRATION TESTS                ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    let authToken = null;
    let refreshToken = null;
    let userId = null;

    // ──────────────────────────────────────────────────────────────────────
    // 1. HEALTH CHECK
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 1: HEALTH CHECK\n');
    
    try {
        const health = await request('GET', '/health');
        test(
            'Health endpoint responds',
            health.status === 200,
            `Status: ${health.status}`
        );
        test(
            'Health endpoint returns OK status',
            health.data?.status === 'OK',
            `Response: ${JSON.stringify(health.data)}`
        );
    } catch (error) {
        test('Health endpoint accessible', false, error.message);
        console.log('\n⚠️  SERVER MUST BE RUNNING FOR API TESTS');
        console.log('   Start server: npm start\n');
        return;
    }

    // ──────────────────────────────────────────────────────────────────────
    // 2. REGISTRATION FLOW
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 2: REGISTRATION FLOW\n');

    // Test 2.1: Register with weak password
    try {
        const weakPass = await request('POST', '/api/auth/register', {
            username: TEST_USERNAME,
            email: TEST_EMAIL,
            password: 'weak',
            consentEssential: true
        });
        test(
            'Registration rejects weak password',
            weakPass.status === 400,
            `Status: ${weakPass.status}`
        );
    } catch (error) {
        test('Registration weak password test', false, error.message);
    }

    // Test 2.2: Register with strong password
    try {
        const registerRes = await request('POST', '/api/auth/register', {
            username: TEST_USERNAME,
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            consentEssential: true,
            consentAnalytics: false
        });
        
        test(
            'Registration accepts strong password',
            registerRes.status === 201,
            `Status: ${registerRes.status}`
        );
        test(
            'Registration returns user data',
            registerRes.data?.success === true && registerRes.data?.data?.user,
            `Has user data: ${!!registerRes.data?.data?.user}`
        );
        
        authToken = registerRes.data?.data?.token;
        userId = registerRes.data?.data?.user?.id;
        
        test(
            'Registration returns JWT token',
            !!authToken && authToken.length > 50,
            `Token length: ${authToken?.length}`
        );
    } catch (error) {
        test('Registration strong password test', false, error.message);
    }

    // Test 2.3: Duplicate registration
    try {
        const duplicateRes = await request('POST', '/api/auth/register', {
            username: TEST_USERNAME + '2',
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            consentEssential: true
        });
        
        test(
            'Registration rejects duplicate email',
            duplicateRes.status === 400,
            `Status: ${duplicateRes.status}`
        );
    } catch (error) {
        test('Duplicate registration test', false, error.message);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. LOGIN FLOW
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 3: LOGIN FLOW\n');

    // Test 3.1: Login with wrong password
    try {
        const wrongPass = await request('POST', '/api/auth/login', {
            email: TEST_EMAIL,
            password: 'WrongPassword123!'
        });
        
        test(
            'Login rejects wrong password',
            wrongPass.status === 401,
            `Status: ${wrongPass.status}`
        );
    } catch (error) {
        test('Login wrong password test', false, error.message);
    }

    // Test 3.2: Login with correct credentials
    try {
        const loginRes = await request('POST', '/api/auth/login', {
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
        
        test(
            'Login accepts correct credentials',
            loginRes.status === 200,
            `Status: ${loginRes.status}`
        );
        test(
            'Login returns tokens',
            loginRes.data?.success === true && loginRes.data?.data?.token,
            `Has token: ${!!loginRes.data?.data?.token}`
        );
        
        authToken = loginRes.data?.data?.token;
        refreshToken = loginRes.data?.data?.refreshToken;
    } catch (error) {
        test('Login correct credentials test', false, error.message);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4. TOKEN VALIDATION
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 4: TOKEN VALIDATION\n');

    // Test 4.1: Validate valid token
    try {
        const validateRes = await request('POST', '/api/auth/validate-token', {
            token: authToken
        });
        
        test(
            'Validate token accepts valid token',
            validateRes.status === 200 && validateRes.data?.valid === true,
            `Valid: ${validateRes.data?.valid}`
        );
    } catch (error) {
        test('Validate valid token test', false, error.message);
    }

    // Test 4.2: Validate invalid token
    try {
        const invalidRes = await request('POST', '/api/auth/validate-token', {
            token: 'invalid.token.here'
        });
        
        test(
            'Validate token rejects invalid token',
            invalidRes.status === 200 && invalidRes.data?.valid === false,
            `Valid: ${invalidRes.data?.valid}`
        );
    } catch (error) {
        test('Validate invalid token test', false, error.message);
    }

    // Test 4.3: Validate missing token
    try {
        const missingRes = await request('POST', '/api/auth/validate-token', {});
        
        test(
            'Validate token rejects missing token',
            missingRes.status === 400,
            `Status: ${missingRes.status}`
        );
    } catch (error) {
        test('Validate missing token test', false, error.message);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 5. REFRESH TOKEN
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 5: REFRESH TOKEN\n');

    // Test 5.1: Refresh with valid refresh token
    if (refreshToken) {
        try {
            const refreshRes = await request('POST', '/api/auth/refresh-token', {
                refreshToken
            });
            
            test(
                'Refresh token returns new token',
                refreshRes.status === 200 && refreshRes.data?.token,
                `Has new token: ${!!refreshRes.data?.token}`
            );
        } catch (error) {
            test('Refresh token test', false, error.message);
        }
    } else {
        test('Refresh token test', false, 'No refresh token from login');
    }

    // Test 5.2: Refresh with invalid refresh token
    try {
        const invalidRefresh = await request('POST', '/api/auth/refresh-token', {
            refreshToken: 'invalid.refresh.token'
        });
        
        test(
            'Refresh token rejects invalid token',
            invalidRefresh.status === 401,
            `Status: ${invalidRefresh.status}`
        );
    } catch (error) {
        test('Invalid refresh token test', false, error.message);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 6. PROTECTED ROUTES
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 6: PROTECTED ROUTES\n');

    // Test 6.1: Access protected route without token
    try {
        const noAuth = await request('GET', '/api/users/profile');
        
        test(
            'Protected route rejects no token',
            noAuth.status === 403 || noAuth.status === 401,
            `Status: ${noAuth.status}`
        );
    } catch (error) {
        test('Protected route no token test', false, error.message);
    }

    // Test 6.2: Access protected route with valid token
    if (authToken) {
        try {
            const withAuth = await request('GET', '/api/users/profile', null, {
                'Authorization': `Bearer ${authToken}`
            });
            
            test(
                'Protected route accepts valid token',
                withAuth.status === 200,
                `Status: ${withAuth.status}`
            );
        } catch (error) {
            // Profile endpoint might not exist, try sessions instead
            try {
                const sessionsRes = await request('GET', '/api/sessions', null, {
                    'Authorization': `Bearer ${authToken}`
                });
                
                test(
                    'Protected route (sessions) accepts valid token',
                    sessionsRes.status === 200,
                    `Status: ${sessionsRes.status}`
                );
            } catch (e) {
                test('Protected route with token test', false, e.message);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // 7. PASSWORD RESET FLOW
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 7: PASSWORD RESET FLOW\n');

    // Test 7.1: Forgot password
    try {
        const forgotRes = await request('POST', '/api/auth/forgot-password', {
            email: TEST_EMAIL
        });
        
        test(
            'Forgot password accepts valid email',
            forgotRes.status === 200,
            `Status: ${forgotRes.status}`
        );
        test(
            'Forgot password returns success message',
            forgotRes.data?.message?.includes('sent'),
            `Message: ${forgotRes.data?.message}`
        );
    } catch (error) {
        test('Forgot password test', false, error.message);
    }

    // Test 7.2: Forgot password with non-existent email
    try {
        const nonExistent = await request('POST', '/api/auth/forgot-password', {
            email: 'nonexistent@example.com'
        });
        
        test(
            'Forgot password does not reveal if email exists',
            nonExistent.status === 200,
            `Status: ${nonExistent.status}`
        );
    } catch (error) {
        test('Forgot password non-existent email test', false, error.message);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 8. RATE LIMITING
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 8: RATE LIMITING\n');

    // Test 8.1: Multiple failed logins should trigger rate limit
    try {
        let rateLimited = false;
        for (let i = 0; i < 7; i++) {
            const res = await request('POST', '/api/auth/login', {
                email: TEST_EMAIL,
                password: 'wrongpassword'
            });
            
            if (res.status === 429) {
                rateLimited = true;
                break;
            }
        }
        
        test(
            'Rate limiting triggers after multiple failed logins',
            rateLimited,
            'Should get 429 after 5+ requests'
        );
    } catch (error) {
        test('Rate limiting test', false, error.message);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 9. CORS & SECURITY HEADERS
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 9: CORS & SECURITY HEADERS\n');

    try {
        const optionsRes = await request('OPTIONS', '/health');
        
        test(
            'CORS headers present',
            optionsRes.headers?.['access-control-allow-origin'] || optionsRes.status === 200,
            `CORS: ${optionsRes.headers?.['access-control-allow-origin'] || 'N/A'}`
        );
    } catch (error) {
        test('CORS headers test', false, error.message);
    }

    try {
        const healthRes = await request('GET', '/health');
        
        test(
            'Security headers present (X-Frame-Options)',
            !!healthRes.headers?.['x-frame-options'],
            `X-Frame-Options: ${healthRes.headers?.['x-frame-options']}`
        );
        test(
            'Security headers present (X-Content-Type-Options)',
            healthRes.headers?.['x-content-type-options'] === 'nosniff',
            `X-Content-Type-Options: ${healthRes.headers?.['x-content-type-options']}`
        );
    } catch (error) {
        test('Security headers test', false, error.message);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 10. API DOCUMENTATION
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n📋 SECTION 10: API DOCUMENTATION\n');

    try {
        const swaggerRes = await request('GET', '/api-docs/');
        
        test(
            'Swagger UI accessible',
            swaggerRes.status === 200,
            `Status: ${swaggerRes.status}`
        );
    } catch (error) {
        test('Swagger UI test', false, error.message);
    }

    try {
        const openConfigRes = await request('GET', '/.well-known/openid-configuration');
        
        test(
            'OpenID configuration endpoint exists',
            openConfigRes.status === 200,
            `Status: ${openConfigRes.status}`
        );
        test(
            'OpenID configuration has required fields',
            openConfigRes.data?.issuer && openConfigRes.data?.authorization_endpoint,
            `Has issuer: ${!!openConfigRes.data?.issuer}`
        );
    } catch (error) {
        test('OpenID configuration test', false, error.message);
    }

    // ──────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const total = results.passed.length + results.failed.length;
    const passRate = total > 0 ? ((results.passed.length / total) * 100).toFixed(1) : 0;

    console.log(`╔═══════════════════════════════════════════════════════════╗`);
    console.log(`║  PASSED:  ${results.passed.length.toString().padEnd(3)} / ${total.toString().padEnd(3)} (${passRate}%)                           ║`);
    console.log(`║  FAILED:  ${results.failed.length.toString().padEnd(3)} / ${total.toString().padEnd(3)}                              ║`);
    console.log(`╚═══════════════════════════════════════════════════════════╝\n`);

    if (results.failed.length > 0) {
        console.log('❌ FAILED TESTS:\n');
        results.failed.forEach(f => {
            console.log(`   ❌ ${f.name}`);
            if (f.details) console.log(`      ${f.details}`);
        });
        console.log();
    }

    // Exit with error code if tests failed
    if (results.failed.length > 0) {
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
});
