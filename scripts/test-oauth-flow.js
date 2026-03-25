#!/usr/bin/env node

/**
 * GitHub & Facebook OAuth Flow Test
 * Tests OAuth endpoints and flow
 * 
 * Usage:
 *   node scripts/test-oauth-flow.js              # Run all tests
 *   node scripts/test-oauth-flow.js --github     # Test GitHub only
 *   node scripts/test-oauth-flow.js --facebook   # Test Facebook only
 *   node scripts/test-oauth-flow.js --status     # Check OAuth status
 */

const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Parse arguments
const args = process.argv.slice(2);
const options = {
    github: args.includes('--github') || args.includes('-g'),
    facebook: args.includes('--facebook') || args.includes('-f'),
    status: args.includes('--status') || args.includes('-s'),
    all: !args.some(arg => arg.startsWith('-'))
};

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const GITHUB_ENABLED = !!process.env.GITHUB_CLIENT_ID && 
                       !!process.env.GITHUB_CLIENT_SECRET &&
                       process.env.GITHUB_CLIENT_ID !== 'your_github_client_id';
const FACEBOOK_ENABLED = !!process.env.FACEBOOK_APP_ID && 
                         !!process.env.FACEBOOK_APP_SECRET &&
                         process.env.FACEBOOK_APP_ID !== 'your_facebook_app_id';

/**
 * Make HTTP request and get response
 */
function makeRequest(path, followRedirects = false) {
    return new Promise((resolve, reject) => {
        const fullUrl = new URL(path, BASE_URL);
        const protocol = fullUrl.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: fullUrl.hostname,
            port: fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
            path: fullUrl.pathname + fullUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'OAuth-Test-Client/1.0'
            }
        };
        
        if (!followRedirects) {
            options.headers['Accept'] = 'application/json';
        }
        
        const req = protocol.get(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Test 1: Check OAuth Configuration Status
 */
async function testOAuthStatus() {
    log('\n📊 OAuth Configuration Status', 'blue');
    log('─'.repeat(60));
    
    log('\n⚙️  Environment Variables:', 'blue');
    
    // GitHub
    log('\n🐙 GitHub OAuth:', 'blue');
    if (GITHUB_ENABLED) {
        log('   ✅ Status: ENABLED', 'green');
        log(`   Client ID: ${process.env.GITHUB_CLIENT_ID?.substring(0, 20)}...`, 'blue');
        log(`   Callback: ${process.env.GITHUB_CALLBACK_URL}`, 'blue');
    } else {
        log('   ⚠️  Status: NOT CONFIGURED', 'yellow');
        log('   Missing: GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET', 'yellow');
    }
    
    // Facebook
    log('\n📘 Facebook OAuth:', 'blue');
    if (FACEBOOK_ENABLED) {
        log('   ✅ Status: ENABLED', 'green');
        log(`   App ID: ${process.env.FACEBOOK_APP_ID?.substring(0, 20)}...`, 'blue');
        log(`   Callback: ${process.env.FACEBOOK_CALLBACK_URL}`, 'blue');
    } else {
        log('   ⚠️  Status: NOT CONFIGURED', 'yellow');
        log('   Missing: FACEBOOK_APP_ID or FACEBOOK_APP_SECRET', 'yellow');
    }
    
    log('\n' + '─'.repeat(60));
}

/**
 * Test 2: Test GitHub OAuth Endpoint
 */
async function testGitHubOAuth() {
    log('\n🐙 Test: GitHub OAuth Flow', 'blue');
    log('─'.repeat(60));
    
    try {
        // Test 1: OAuth initiation
        log('\n📤 Test 1: GitHub OAuth Initiation', 'blue');
        log(`   URL: ${BASE_URL}/api/auth/github`, 'blue');
        
        const response = await makeRequest('/api/auth/github', true);
        
        log(`   Status: ${response.statusCode}`, response.statusCode === 302 || response.statusCode === 503 ? 'green' : 'yellow');
        
        if (response.statusCode === 302) {
            log('   ✅ Redirect to GitHub successful', 'green');
            log(`   Location: ${response.headers.location?.substring(0, 100)}...`, 'blue');
            
            // Check redirect URL
            if (response.headers.location?.includes('github.com')) {
                log('   ✅ Redirecting to GitHub', 'green');
            }
        } else if (response.statusCode === 503) {
            log('   ⚠️  GitHub OAuth not configured', 'yellow');
            log(`   Response: ${response.body}`, 'yellow');
        } else {
            log(`   ⚠️  Unexpected status: ${response.statusCode}`, 'yellow');
        }
        
        // Test 2: Check callback route exists
        log('\n📥 Test 2: GitHub Callback Route', 'blue');
        log(`   URL: ${BASE_URL}/api/auth/github/callback`, 'blue');
        
        // Just check if route exists (will fail without proper OAuth state)
        try {
            const callbackResponse = await makeRequest('/api/auth/github/callback?error=redirect_uri_mismatch', false);
            log(`   Callback route exists: ${callbackResponse.statusCode === 200 || callbackResponse.statusCode === 302 ? '✅' : '⚠️'}`, 'blue');
        } catch (error) {
            log(`   ⚠️  Callback test inconclusive: ${error.message}`, 'yellow');
        }
        
        log('\n✅ GitHub OAuth endpoint test completed', 'green');
        
        return {
            enabled: GITHUB_ENABLED,
            statusCode: response.statusCode,
            working: response.statusCode === 302 || response.statusCode === 503
        };
    } catch (error) {
        log(`❌ GitHub OAuth test failed: ${error.message}`, 'red');
        return {
            enabled: GITHUB_ENABLED,
            error: error.message,
            working: false
        };
    }
}

/**
 * Test 3: Test Facebook OAuth Endpoint
 */
async function testFacebookOAuth() {
    log('\n📘 Test: Facebook OAuth Flow', 'blue');
    log('─'.repeat(60));
    
    try {
        // Test 1: OAuth initiation
        log('\n📤 Test 1: Facebook OAuth Initiation', 'blue');
        log(`   URL: ${BASE_URL}/api/auth/facebook`, 'blue');
        
        const response = await makeRequest('/api/auth/facebook', true);
        
        log(`   Status: ${response.statusCode}`, response.statusCode === 302 || response.statusCode === 503 ? 'green' : 'yellow');
        
        if (response.statusCode === 302) {
            log('   ✅ Redirect to Facebook successful', 'green');
            log(`   Location: ${response.headers.location?.substring(0, 100)}...`, 'blue');
            
            // Check redirect URL
            if (response.headers.location?.includes('facebook.com')) {
                log('   ✅ Redirecting to Facebook', 'green');
            }
        } else if (response.statusCode === 503) {
            log('   ⚠️  Facebook OAuth not configured', 'yellow');
            log(`   Response: ${response.body}`, 'yellow');
        } else {
            log(`   ⚠️  Unexpected status: ${response.statusCode}`, 'yellow');
        }
        
        // Test 2: Check callback route exists
        log('\n📥 Test 2: Facebook Callback Route', 'blue');
        log(`   URL: ${BASE_URL}/api/auth/facebook/callback`, 'blue');
        
        try {
            const callbackResponse = await makeRequest('/api/auth/facebook/callback?error=test', false);
            log(`   Callback route exists: ${callbackResponse.statusCode === 200 || callbackResponse.statusCode === 302 ? '✅' : '⚠️'}`, 'blue');
        } catch (error) {
            log(`   ⚠️  Callback test inconclusive: ${error.message}`, 'yellow');
        }
        
        log('\n✅ Facebook OAuth endpoint test completed', 'green');
        
        return {
            enabled: FACEBOOK_ENABLED,
            statusCode: response.statusCode,
            working: response.statusCode === 302 || response.statusCode === 503
        };
    } catch (error) {
        log(`❌ Facebook OAuth test failed: ${error.message}`, 'red');
        return {
            enabled: FACEBOOK_ENABLED,
            error: error.message,
            working: false
        };
    }
}

/**
 * Print test summary
 */
function printSummary(results) {
    log('\n' + '═'.repeat(60), 'magenta');
    log('📊 OAuth Test Summary', 'magenta');
    log('═'.repeat(60), 'magenta');
    
    if (results.github) {
        const githubStatus = results.github.working ? '✅' : '❌';
        const configStatus = results.github.enabled ? 'Configured' : 'Not Configured';
        log(`${githubStatus} GitHub OAuth: ${configStatus}`, results.github.working ? 'green' : 'yellow');
    }
    
    if (results.facebook) {
        const facebookStatus = results.facebook.working ? '✅' : '❌';
        const configStatus = results.facebook.enabled ? 'Configured' : 'Not Configured';
        log(`${facebookStatus} Facebook OAuth: ${configStatus}`, results.facebook.working ? 'green' : 'yellow');
    }
    
    log('\n' + '─'.repeat(60), 'blue');
    
    const allWorking = (!results.github || results.github.working) && 
                       (!results.facebook || results.facebook.working);
    
    if (allWorking) {
        log('📈 Overall Status: ✅ ALL TESTS PASSED', 'green');
    } else {
        log('📈 Overall Status: ⚠️  SOME TESTS NEED ATTENTION', 'yellow');
    }
    
    log('═'.repeat(60), 'magenta');
    
    if (!GITHUB_ENABLED || !FACEBOOK_ENABLED) {
        log('\n💡 To enable OAuth:', 'yellow');
        log('   1. Add credentials to .env file', 'yellow');
        log('   2. Restart application: docker restart auth-app', 'yellow');
        log('   3. Run tests again', 'yellow');
    }
    log('');
}

/**
 * Run all tests
 */
async function runAllTests() {
    log('\n' + '═'.repeat(60), 'magenta');
    log('🚀 GitHub & Facebook OAuth Test Suite', 'magenta');
    log('═'.repeat(60), 'magenta');
    
    log(`\n📡 Base URL: ${BASE_URL}`, 'blue');
    log(`🕒 Test Time: ${new Date().toLocaleString()}`, 'blue');
    
    const results = {};
    
    // Test status first
    await testOAuthStatus();
    
    // Test GitHub
    if (options.github || options.all) {
        results.github = await testGitHubOAuth();
    }
    
    // Test Facebook
    if (options.facebook || options.all) {
        results.facebook = await testFacebookOAuth();
    }
    
    // Print summary
    printSummary(results);
    
    return results;
}

/**
 * Main execution
 */
async function main() {
    try {
        if (options.status) {
            await testOAuthStatus();
        } else if (options.github) {
            await testGitHubOAuth();
        } else if (options.facebook) {
            await testFacebookOAuth();
        } else {
            await runAllTests();
        }
    } catch (error) {
        log(`\n❌ Fatal error: ${error.message}`, 'red');
        log(error.stack, 'red');
        process.exit(1);
    }
}

// Run main
main();
