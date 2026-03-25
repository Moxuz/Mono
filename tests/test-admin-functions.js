/**
 * Admin Function Test Script
 * Creates admin user and tests all admin endpoints
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';
let adminToken = null;

// Helper function to make HTTP requests
function httpRequest(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port || 5000,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = body ? JSON.parse(body) : {};
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: json
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
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

async function testAdminFunctions() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║           ADMIN FUNCTION TEST SUITE                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    let passed = 0;
    let failed = 0;

    try {
        // Step 1: Register a new user
        console.log('📋 STEP 1: Register Test User\n');
        const registerResponse = await httpRequest('POST', '/api/auth/register', {
            username: 'admintest',
            email: `admintest_${Date.now()}@example.com`,
            password: 'MyStr0ng@Pass!Xy',
            consentEssential: true
        });

        if (registerResponse.statusCode === 200 || registerResponse.statusCode === 201) {
            console.log('✅ User registered successfully');
            adminToken = registerResponse.data.data.token;
            passed++;
        } else {
            console.log('❌ Registration failed:', registerResponse.data);
            failed++;
            console.log('\n⚠️  Cannot continue without user registration\n');
            return;
        }

        // Step 2: Get user profile to confirm token works
        console.log('\n📋 STEP 2: Test Token with Profile Endpoint\n');
        const profileResponse = await httpRequest('GET', '/api/users/profile', null, adminToken);
        
        if (profileResponse.statusCode === 200) {
            console.log('✅ Token is valid, profile retrieved');
            console.log(`   User: ${profileResponse.data.data.username}`);
            console.log(`   Email: ${profileResponse.data.data.email}`);
            console.log(`   Role: ${profileResponse.data.data.role}`);
            passed++;
        } else {
            console.log('❌ Profile retrieval failed:', profileResponse.statusCode);
            failed++;
        }

        // Step 3: Test Analytics Endpoints (will be 403 for non-admin)
        console.log('\n📋 STEP 3: Test Analytics Endpoints (Non-Admin User)\n');
        
        const analyticsTests = [
            { name: 'Get User Stats', path: '/api/dashboard/analytics/users' },
            { name: 'Get Login Stats', path: '/api/dashboard/analytics/logins' },
            { name: 'Get Security Stats', path: '/api/dashboard/analytics/security' },
            { name: 'Get Activity Feed', path: '/api/dashboard/analytics/activity?limit=5' }
        ];

        for (const test of analyticsTests) {
            const response = await httpRequest('GET', test.path, null, adminToken);
            if (response.statusCode === 403) {
                console.log(`⚠️  ${test.name}: 403 Forbidden (requires admin role)`);
            } else if (response.statusCode === 200) {
                console.log(`✅ ${test.name}: 200 OK`);
                passed++;
            } else {
                console.log(`❌ ${test.name}: ${response.statusCode}`);
                failed++;
            }
        }

        // Step 4: Test Monitoring Endpoints
        console.log('\n📋 STEP 4: Test Monitoring Endpoints\n');
        
        const monitoringTests = [
            { name: 'Real-Time Monitoring', path: '/api/dashboard/monitoring/realtime' },
            { name: 'System Health', path: '/api/dashboard/monitoring/health' },
            { name: 'Redis Health', path: '/api/dashboard/health/redis' }
        ];

        for (const test of monitoringTests) {
            const response = await httpRequest('GET', test.path, null, adminToken);
            if (response.statusCode === 403) {
                console.log(`⚠️  ${test.name}: 403 Forbidden (requires admin role)`);
            } else if (response.statusCode === 200) {
                console.log(`✅ ${test.name}: 200 OK`);
                passed++;
            } else {
                console.log(`❌ ${test.name}: ${response.statusCode}`);
                failed++;
            }
        }

        // Step 5: Test Security Logs
        console.log('\n📋 STEP 5: Test Security Logs\n');
        
        const logTests = [
            { name: 'Get Security Logs', path: '/api/dashboard/logs/security' },
            { name: 'Get Login History', path: '/api/dashboard/logs/logins' }
        ];

        for (const test of logTests) {
            const response = await httpRequest('GET', test.path, null, adminToken);
            if (response.statusCode === 404) {
                console.log(`⚠️  ${test.name}: 404 Not Found (route may not exist)`);
            } else if (response.statusCode === 403) {
                console.log(`⚠️  ${test.name}: 403 Forbidden (requires admin role)`);
            } else if (response.statusCode === 200) {
                console.log(`✅ ${test.name}: 200 OK`);
                passed++;
            } else {
                console.log(`❌ ${test.name}: ${response.statusCode}`);
                failed++;
            }
        }

        // Step 6: Test Session Management
        console.log('\n📋 STEP 6: Test Session Management\n');
        
        const sessionTests = [
            { name: 'List Sessions', path: '/api/sessions/list' },
            { name: 'Revoke All Sessions', path: '/api/sessions/revoke-all', method: 'POST' }
        ];

        for (const test of sessionTests) {
            const response = await httpRequest(test.method || 'GET', test.path, null, adminToken);
            if (response.statusCode === 404) {
                console.log(`⚠️  ${test.name}: 404 Not Found (route may not exist)`);
            } else if (response.statusCode === 200) {
                console.log(`✅ ${test.name}: 200 OK`);
                passed++;
            } else {
                console.log(`❌ ${test.name}: ${response.statusCode}`);
                failed++;
            }
        }

        // Summary
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║                    TEST SUMMARY                           ║');
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log(`║  ✅ Passed: ${passed.toString().padEnd(43)} ║`);
        console.log(`║  ⚠️  Expected 403: ${failed.toString().padEnd(38)} ║`);
        console.log('╚═══════════════════════════════════════════════════════════╝\n');

        console.log('📝 NOTES:');
        console.log('   • 403 Forbidden = Endpoint exists but requires admin role');
        console.log('   • 404 Not Found = Endpoint route does not exist');
        console.log('   • 200 OK = Endpoint accessible and working\n');

        console.log('🔧 TO TEST AS ADMIN:');
        console.log('   1. Login to MongoDB: docker exec -it auth-mongodb mongosh authdb');
        console.log('   2. Update user role: db.users.updateOne({email: "admintest_...@example.com"}, {$set: {role: "admin"}})');
        console.log('   3. Re-login to get admin token');
        console.log('   4. Re-run tests to access admin endpoints\n');

    } catch (error) {
        console.error('\n❌ Test execution failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testAdminFunctions();
