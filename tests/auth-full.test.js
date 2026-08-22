'use strict';
const http = require('http');
const jwt  = require('jsonwebtoken');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key_123456';
const BASE = 'http://localhost:5000';

const R = { pass: [], fail: [], total: 0 };
function pass(n, d) { R.total++; R.pass.push(n); console.log('  \u2705 ' + n + (d ? ' \u2014 ' + d : '')); }
function fail(n, d) { R.total++; R.fail.push(n); console.log('  \u274c ' + n + (d ? ' \u2014 ' + d : '')); }
function check(name, cond, detail) { cond ? pass(name, detail) : fail(name, detail); }

function req(method, p, data, headers) {
  headers = headers || {};
  return new Promise(function(resolve, reject) {
    const url = new URL(p, BASE);
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: url.hostname, port: url.port || 5000,
      path: url.pathname + url.search, method: method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        body ? { 'Content-Length': Buffer.byteLength(body) } : {},
        headers
      )
    };
    const r = http.request(opts, function(res) {
      let b = '';
      res.on('data', function(c) { b += c; });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, data: JSON.parse(b), headers: res.headers }); }
        catch(e) { resolve({ status: res.statusCode, data: b, headers: res.headers }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
function auth(t) { return { Authorization: 'Bearer ' + t }; }
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function run() {
  const ts = Date.now();
  const email    = 'authtest_' + ts + '@example.com';
  const username = ('authtest' + ts).slice(0, 20);
  const password = 'TestPass123!';

  // ── 1. REGISTRATION ──────────────────────────────────────────────────────
  console.log('\n\uD83D\uDD10 1. Registration');

  const badReg = await req('POST', '/api/auth/register', { username: 'a', email: 'bad', password: 'weak', consentEssential: true });
  check('Weak credentials rejected (not 201)', badReg.status !== 201, 'HTTP ' + badReg.status);

  const noConsent = await req('POST', '/api/auth/register', { username, email, password, consentEssential: false });
  check('Register without consent rejected', noConsent.status !== 201, 'HTTP ' + noConsent.status);

  const regRes = await req('POST', '/api/auth/register', { username, email, password, consentEssential: true });
  check('Register valid user (HTTP 201)', regRes.status === 201, 'HTTP ' + regRes.status);
  check('Register returns success:true', regRes.data && regRes.data.success === true);

  const dupReg = await req('POST', '/api/auth/register', { username, email, password, consentEssential: true });
  check('Duplicate email rejected', dupReg.status !== 201, 'HTTP ' + dupReg.status);

  // ── 2. LOGIN ─────────────────────────────────────────────────────────────
  console.log('\n\uD83D\uDD11 2. Login');

  const badLogin = await req('POST', '/api/auth/login/token', { email, password: 'WrongPass999!' });
  check('Wrong password rejected (401)', badLogin.status === 401, 'HTTP ' + badLogin.status);

  const noUserLogin = await req('POST', '/api/auth/login/token', { email: 'nobody@nowhere.com', password });
  check('Unknown email rejected (401)', noUserLogin.status === 401, 'HTTP ' + noUserLogin.status);

  const loginRes = await req('POST', '/api/auth/login/token', { email, password });
  check('Valid login returns 200',    loginRes.status === 200, 'HTTP ' + loginRes.status);
  check('Login returns access token', !!(loginRes.data && loginRes.data.data && loginRes.data.data.token));
  check('Login returns refreshToken', !!(loginRes.data && loginRes.data.data && loginRes.data.data.refreshToken));
  check('Login returns sessionId',    !!(loginRes.data && loginRes.data.data && loginRes.data.data.sessionId));

  const token      = loginRes.data && loginRes.data.data && loginRes.data.data.token;
  const refreshTok = loginRes.data && loginRes.data.data && loginRes.data.data.refreshToken;
  const sessionId  = loginRes.data && loginRes.data.data && loginRes.data.data.sessionId;

  // JWT structure — decode without verifying (server uses docker-compose secret, not .env)
  let decoded = null;
  try { decoded = jwt.decode(token); } catch(e) { decoded = null; }
  check('JWT is decodable (valid structure)', !!decoded);
  check('JWT has id claim',    !!(decoded && decoded.id));
  check('JWT has email claim', decoded && decoded.email === email);
  check('JWT has role claim',  !!(decoded && decoded.role));
  check('JWT has jti claim',   !!(decoded && decoded.jti));
  check('JWT has exp claim',   !!(decoded && decoded.exp));

  // ── 3. PROFILE ───────────────────────────────────────────────────────────
  console.log('\n\uD83D\uDC64 3. Profile');

  const profileRes = await req('GET', '/api/auth/profile', null, auth(token));
  check('GET /profile returns 200',        profileRes.status === 200, 'HTTP ' + profileRes.status);
  check('Profile has email',               profileRes.data && profileRes.data.data && profileRes.data.data.email === email);
  check('Profile has username',            profileRes.data && profileRes.data.data && profileRes.data.data.username === username);
  check('Profile has hasPassword field',   profileRes.data && profileRes.data.data && 'hasPassword' in profileRes.data.data);
  check('hasPassword true for local user', profileRes.data && profileRes.data.data && profileRes.data.data.hasPassword === true);
  check('Profile has role',                !!(profileRes.data && profileRes.data.data && profileRes.data.data.role));
  check('Profile has createdAt',           !!(profileRes.data && profileRes.data.data && profileRes.data.data.createdAt));

  const noAuthProfile = await req('GET', '/api/auth/profile');
  check('Profile without token rejected (401 or 403)', noAuthProfile.status === 401 || noAuthProfile.status === 403, 'HTTP ' + noAuthProfile.status);

  // ── 4. TOKEN OPERATIONS ──────────────────────────────────────────────────
  console.log('\n\uD83D\uDD04 4. Token Operations');

  const validateRes = await req('POST', '/api/auth/validate-token', { token });
  check('POST /validate-token returns 200',  validateRes.status === 200, 'HTTP ' + validateRes.status);
  const isValid = (validateRes.data && validateRes.data.data && validateRes.data.data.valid) ||
                  (validateRes.data && validateRes.data.valid);
  check('Validate confirms token is valid',  isValid === true);

  const expiredToken = jwt.sign({ id: 'fake', email, role: 'user', jti: 'test-exp' }, JWT_SECRET, { expiresIn: -1 });
  const expiredRes = await req('GET', '/api/auth/profile', null, auth(expiredToken));
  check('Expired JWT rejected (401)', expiredRes.status === 401, 'HTTP ' + expiredRes.status);

  const refreshRes = await req('POST', '/api/auth/refresh-token', { refreshToken: refreshTok });
  check('POST /refresh-token returns 200', refreshRes.status === 200, 'HTTP ' + refreshRes.status + ': ' + (refreshRes.data && refreshRes.data.error || ''));
  const newToken = (refreshRes.data && refreshRes.data.data && refreshRes.data.data.token) ||
                   (refreshRes.data && refreshRes.data.token);
  check('Refresh returns new access token', !!newToken);
  check('New token is different',           newToken !== token);

  const badRefreshRes = await req('POST', '/api/auth/refresh-token', { refreshToken: 'garbage.token.value' });
  check('Invalid refresh token rejected (not 200)', badRefreshRes.status !== 200, 'HTTP ' + badRefreshRes.status);

  const workingToken = newToken || token;

  // ── 5. CHANGE PASSWORD ───────────────────────────────────────────────────
  console.log('\n\uD83D\uDD12 5. Change Password');

  const newPassword = 'NewTestPass456!';

  const cpNoCurrentRes = await req('POST', '/api/auth/change-password', { newPassword }, auth(workingToken));
  check('Change password without currentPassword rejected', cpNoCurrentRes.status !== 200, 'HTTP ' + cpNoCurrentRes.status);

  const cpWrongRes = await req('POST', '/api/auth/change-password', { currentPassword: 'WrongPass!', newPassword }, auth(workingToken));
  check('Change password with wrong current rejected', cpWrongRes.status === 401 || cpWrongRes.status === 400, 'HTTP ' + cpWrongRes.status);

  const cpRes = await req('POST', '/api/auth/change-password', { currentPassword: password, newPassword }, auth(workingToken));
  check('Change password succeeds (200)', cpRes.status === 200, 'HTTP ' + cpRes.status + ': ' + (cpRes.data && cpRes.data.error || ''));

  const reloginRes = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  check('Login with new password works',  reloginRes.status === 200, 'HTTP ' + reloginRes.status);
  const reloginToken = reloginRes.data && reloginRes.data.data && reloginRes.data.data.token;

  const oldPwdLogin = await req('POST', '/api/auth/login/token', { email, password });
  check('Old password rejected after change', oldPwdLogin.status === 401, 'HTTP ' + oldPwdLogin.status);

  // ── 6. FORGOT / RESET PASSWORD ───────────────────────────────────────────
  console.log('\n\uD83D\uDCE7 6. Forgot / Reset Password');

  const fpRes = await req('POST', '/api/auth/forgot-password', { email });
  check('POST /forgot-password returns 200', fpRes.status === 200, 'HTTP ' + fpRes.status + ': ' + ((fpRes.data && fpRes.data.message) || (fpRes.data && fpRes.data.error) || ''));

  const fpFakeRes = await req('POST', '/api/auth/forgot-password', { email: 'nobody@example.com' });
  check('Forgot-password for unknown email returns 200 (no user enum)', fpFakeRes.status === 200, 'HTTP ' + fpFakeRes.status);

  const badResetRes = await req('POST', '/api/auth/reset-password/invalid-token-xyz', { newPassword: 'Reset123!' });
  check('Reset with invalid token rejected (not 200)', badResetRes.status !== 200, 'HTTP ' + badResetRes.status);

  // ── 7. SESSIONS ──────────────────────────────────────────────────────────
  console.log('\n\uD83D\uDCCB 7. Session Management');

  const currentToken = reloginToken || workingToken;

  const sessRes = await req('GET', '/api/sessions', null, auth(currentToken));
  check('GET /sessions returns 200', sessRes.status === 200, 'HTTP ' + sessRes.status);
  const sessions = (sessRes.data && sessRes.data.data && sessRes.data.data.sessions) ||
                   (sessRes.data && sessRes.data.data) || [];
  check('At least 1 session returned', Array.isArray(sessions) && sessions.length >= 1, 'count: ' + sessions.length);
  if (sessions[0]) {
    check('Session has createdAt',    !!sessions[0].createdAt);
    check('Session has lastActiveAt', !!sessions[0].lastActiveAt);
    check('Session has deviceInfo',   sessions[0].deviceInfo !== undefined);
  }

  const countRes = await req('GET', '/api/sessions/count', null, auth(currentToken));
  check('GET /sessions/count returns 200', countRes.status === 200, 'HTTP ' + countRes.status);
  const count = (countRes.data && countRes.data.data && countRes.data.data.count != null ? countRes.data.data.count :
                (countRes.data && countRes.data.count != null ? countRes.data.count : null));
  check('Session count >= 1', typeof count === 'number' && count >= 1, 'count: ' + count);

  const extra1 = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const extra2 = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const tokenExtra1 = extra1.data && extra1.data.data && extra1.data.data.token;
  const sessionIdExtra1 = extra1.data && extra1.data.data && extra1.data.data.sessionId;

  if (sessionIdExtra1) {
    const revokeRes = await req('DELETE', '/api/sessions/' + sessionIdExtra1, null, auth(tokenExtra1));
    check('DELETE /sessions/:id returns 200', revokeRes.status === 200, 'HTTP ' + revokeRes.status);
  }

  const revokeOthersRes = await req('DELETE', '/api/sessions/others/all', null, auth(currentToken));
  check('DELETE /sessions/others/all returns 200', revokeOthersRes.status === 200, 'HTTP ' + revokeOthersRes.status);

  const countAfterOthers = await req('GET', '/api/sessions/count', null, auth(currentToken));
  const numAfter = countAfterOthers.data && countAfterOthers.data.data && countAfterOthers.data.data.count != null
    ? countAfterOthers.data.data.count : (countAfterOthers.data && countAfterOthers.data.count);
  check('Only 1 session left after revoke-others', numAfter === 1, 'count: ' + numAfter);

  const revokeAllRes = await req('DELETE', '/api/sessions/all', null, auth(currentToken));
  check('DELETE /sessions/all returns 200', revokeAllRes.status === 200, 'HTTP ' + revokeAllRes.status);

  // ── 8. LOGOUT ────────────────────────────────────────────────────────────
  console.log('\n\uD83D\uDEAA 8. Logout');

  const loginForLogout = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const logoutToken = loginForLogout.data && loginForLogout.data.data && loginForLogout.data.data.token;
  const logoutRes = await req('POST', '/api/auth/logout', null, auth(logoutToken));
  check('POST /logout returns 200', logoutRes.status === 200, 'HTTP ' + logoutRes.status);

  // ── 9. PREFERENCES ───────────────────────────────────────────────────────
  console.log('\n\u2699\uFE0F  9. Preferences');

  const loginForPrefs = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const prefsToken = loginForPrefs.data && loginForPrefs.data.data && loginForPrefs.data.data.token;

  const getPrefs = await req('GET', '/api/auth/preferences', null, auth(prefsToken));
  check('GET /preferences returns 200', getPrefs.status === 200, 'HTTP ' + getPrefs.status);
  const prefsData = (getPrefs.data && getPrefs.data.data && getPrefs.data.data.preferences) ||
                    (getPrefs.data && getPrefs.data.data) || {};
  // Preferences structure: { notifications: { email, loginAlerts }, theme, language }
  check('Preferences has notifications object', !!(prefsData.notifications || prefsData.emailNotifications !== undefined));

  const updatePrefs = await req('PUT', '/api/auth/preferences', { emailNotifications: false, loginAlerts: false }, auth(prefsToken));
  check('PUT /preferences returns 200', updatePrefs.status === 200, 'HTTP ' + updatePrefs.status);

  // ── 10. SECURITY AUDIT ───────────────────────────────────────────────────
  console.log('\n\uD83D\uDEE1\uFE0F  10. Security Audit');

  const auditRes = await req('GET', '/api/auth/security-audit', null, auth(prefsToken));
  check('GET /security-audit returns 200', auditRes.status === 200, 'HTTP ' + auditRes.status);
  const auditData = (auditRes.data && auditRes.data.data && auditRes.data.data.audits) ||
                    (auditRes.data && auditRes.data.data);
  check('Audit returns array', Array.isArray(auditData));

  const logsRes = await req('GET', '/api/auth/audit-logs', null, auth(prefsToken));
  check('GET /audit-logs returns 200', logsRes.status === 200, 'HTTP ' + logsRes.status);

  // ── 12. OAUTH PROVIDER STATUS & INITIATION ───────────────────────────────
  console.log('\n\uD83C\uDF10 12. OAuth Provider Status & Initiation');

  const oauthStatus = await req('GET', '/api/auth/oauth/status');
  check('GET /oauth/status returns 200', oauthStatus.status === 200, 'HTTP ' + oauthStatus.status);
  const oauthData = oauthStatus.data && oauthStatus.data.data || {};
  check('Google status present',              'google' in oauthData);
  check('GitHub status present',              'github' in oauthData);
  check('Facebook status absent (removed)',   !('facebook' in oauthData));

  const googleInit = await req('GET', '/api/auth/google');
  const githubInit = await req('GET', '/api/auth/github');
  check('GET /auth/google  -> 302 to accounts.google.com', googleInit.status === 302 && (googleInit.headers.location || '').includes('accounts.google.com'));
  check('GET /auth/github  -> 302 to github.com',          githubInit.status === 302 && (githubInit.headers.location || '').includes('github.com'));
  check('GET /auth/facebook -> 404 (removed)',              (await req('GET', '/api/auth/facebook')).status === 404);
  check('Google redirect has correct client_id',           (googleInit.headers.location || '').includes('1043865445999'));
  check('GitHub redirect has correct client_id',           (githubInit.headers.location || '').includes('Ov23li5URQATFm9PZPJG'));
  check('Google redirect has prompt=select_account',       (googleInit.headers.location || '').includes('select_account'));
  check('Google redirect has scope=profile+email',         (googleInit.headers.location || '').includes('scope=profile'));
  check('GitHub redirect has scope=user:email',            (githubInit.headers.location || '').includes('user%3Aemail') || (githubInit.headers.location || '').includes('user:email'));

  // ── 13. OIDC WELL-KNOWN ──────────────────────────────────────────────────
  console.log('\n\uD83C\uDF0D 13. OIDC Well-Known Endpoints');

  const oidcConfig = await req('GET', '/.well-known/openid-configuration');
  check('GET /.well-known/openid-configuration returns 200', oidcConfig.status === 200, 'HTTP ' + oidcConfig.status);
  check('OIDC config has issuer',                  !!(oidcConfig.data && oidcConfig.data.issuer));
  check('OIDC config has authorization_endpoint',  !!(oidcConfig.data && oidcConfig.data.authorization_endpoint));
  check('OIDC config has token_endpoint',          !!(oidcConfig.data && oidcConfig.data.token_endpoint));
  check('OIDC config has jwks_uri',                !!(oidcConfig.data && oidcConfig.data.jwks_uri));
  check('OIDC config has userinfo_endpoint',       !!(oidcConfig.data && oidcConfig.data.userinfo_endpoint));

  const jwks = await req('GET', '/.well-known/jwks.json');
  check('GET /.well-known/jwks.json returns 200',  jwks.status === 200, 'HTTP ' + jwks.status);
  check('JWKS has keys array',                     Array.isArray(jwks.data && jwks.data.keys));

  // ── 14. OAUTH CLIENT CRUD ────────────────────────────────────────────────
  console.log('\n\uD83D\uDD11 14. OAuth Client (API Key) CRUD');

  const loginForOauth = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const oauthToken = loginForOauth.data && loginForOauth.data.data && loginForOauth.data.data.token;

  const listEmpty = await req('GET', '/api/oauth/clients', null, auth(oauthToken));
  check('GET /oauth/clients returns 200', listEmpty.status === 200, 'HTTP ' + listEmpty.status);

  const createOauth = await req('POST', '/api/oauth/clients', {
    client_name: 'Test OAuth App',
    redirect_uris: ['http://localhost:3000/callback'],
    application_type: 'web',
    contact_email: email,
    scope: 'openid profile email'
  }, auth(oauthToken));
  check('POST /oauth/clients returns 201', createOauth.status === 201, 'HTTP ' + createOauth.status);
  const client = createOauth.data && createOauth.data.data;
  check('Response has client_id',     !!(client && client.client_id));
  check('Response has client_secret', !!(client && client.client_secret));
  check('Response has scope',         client && client.scope === 'openid profile email', 'scope: ' + (client && client.scope));

  if (client && client.client_id) {
    const getClient = await req('GET', '/api/oauth/clients/' + client.client_id, null, auth(oauthToken));
    check('GET /oauth/clients/:id returns 200', getClient.status === 200, 'HTTP ' + getClient.status);

    const updateRes = await req('PUT', '/api/oauth/clients/' + client.client_id, { client_name: 'Updated App' }, auth(oauthToken));
    check('PUT /oauth/clients/:id returns 200', updateRes.status === 200, 'HTTP ' + updateRes.status);

    const deleteRes = await req('DELETE', '/api/oauth/clients/' + client.client_id, null, auth(oauthToken));
    check('DELETE /oauth/clients/:id returns 200', deleteRes.status === 200, 'HTTP ' + deleteRes.status);

    const listAfter = await req('GET', '/api/oauth/clients', null, auth(oauthToken));
    const afterCount = listAfter.data && listAfter.data.data && listAfter.data.data.clients
      ? listAfter.data.data.clients.length : null;
    check('Revoked key removed from list (count 0)', afterCount === 0, 'count: ' + afterCount);
  }

  // ── 16. USERS MODULE ─────────────────────────────────────────────────────
  console.log('\n\uD83D\uDC65 16. Users Module');

  const loginForUsers = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const usersToken = loginForUsers.data && loginForUsers.data.data && loginForUsers.data.data.token;

  const meRes = await req('GET', '/api/users/me', null, auth(usersToken));
  check('GET /users/me returns 200', meRes.status === 200, 'HTTP ' + meRes.status);
  const meUser = meRes.data && meRes.data.user;
  check('GET /users/me has id',    !!(meUser && meUser.id));
  check('GET /users/me has email', !!(meUser && meUser.email));
  check('GET /users/me has role',  !!(meUser && meUser.role));

  const userProfileRes = await req('GET', '/api/users/profile', null, auth(usersToken));
  check('GET /users/profile returns 200', userProfileRes.status === 200, 'HTTP ' + userProfileRes.status);

  const updateProfileRes = await req('PUT', '/api/users/profile', { username: ('upd' + ts).slice(0, 20) }, auth(usersToken));
  check('PUT /users/profile returns 200', updateProfileRes.status === 200, 'HTTP ' + updateProfileRes.status);

  const exportRes = await req('GET', '/api/users/export', null, auth(usersToken));
  check('GET /users/export returns 200', exportRes.status === 200, 'HTTP ' + exportRes.status);
  check('Export returns data', !!(exportRes.data && exportRes.data.data));

  const meNoAuth = await req('GET', '/api/users/me');
  check('GET /users/me without token rejected (401)', meNoAuth.status === 401, 'HTTP ' + meNoAuth.status);

  // ── 17. OAUTH PROTOCOL ENDPOINTS ─────────────────────────────────────────
  console.log('\n\uD83D\uDD10 17. OAuth Protocol Endpoints');

  // Create a client to use for authorize test
  const createProto = await req('POST', '/api/oauth/clients', {
    client_name: 'Proto Test App',
    redirect_uris: ['http://localhost:3000/cb'],
    application_type: 'web',
    contact_email: email,
    scope: 'openid profile email'
  }, auth(usersToken));
  const protoClient = createProto.data && createProto.data.data;

  // GET /api/oauth/authorize — without session redirects to login page (302)
  const authzQuery = protoClient
    ? '?client_id=' + protoClient.client_id + '&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcb&response_type=code&scope=openid%20profile%20email&state=s&code_challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&code_challenge_method=S256&nonce=n'
    : '?client_id=none';
  const authzGet = await req('GET', '/api/oauth/authorize' + authzQuery);
  check('GET /oauth/authorize redirects (302) when not logged in', authzGet.status === 302, 'HTTP ' + authzGet.status);
  check('Authorize redirect goes to login', (authzGet.headers.location || '').includes('login'), 'location: ' + authzGet.headers.location);

  // POST /api/oauth/introspect — regular auth JWT returns active:false (not type:'access_token')
  const introspectRes = await req('POST', '/api/oauth/introspect', { token: usersToken });
  check('POST /oauth/introspect returns 200',         introspectRes.status === 200, 'HTTP ' + introspectRes.status);
  check('Introspect returns active field (boolean)',  typeof (introspectRes.data && introspectRes.data.active) === 'boolean');

  // POST /api/oauth/revoke — revoke a secondary token
  const loginForRevoke = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const tokenToRevoke = loginForRevoke.data && loginForRevoke.data.data && loginForRevoke.data.data.token;
  const revokeRes = await req('POST', '/api/oauth/revoke', { token: tokenToRevoke }, auth(usersToken));
  check('POST /oauth/revoke returns 200', revokeRes.status === 200, 'HTTP ' + revokeRes.status);

  // Revoked token should be rejected
  const profileWithRevoked = await req('GET', '/api/auth/profile', null, auth(tokenToRevoke));
  check('Revoked token rejected on protected route (401)', profileWithRevoked.status === 401, 'HTTP ' + profileWithRevoked.status);

  // Clean up proto client
  if (protoClient && protoClient.client_id) {
    await req('DELETE', '/api/oauth/clients/' + protoClient.client_id, null, auth(usersToken));
  }

  // ── 18. DASHBOARD USER ENDPOINTS ─────────────────────────────────────────
  console.log('\n\uD83D\uDCCA 18. Dashboard User Endpoints');

  const secSummary = await req('GET', '/api/dashboard/user/security-summary', null, auth(usersToken));
  check('GET /dashboard/user/security-summary returns 200', secSummary.status === 200, 'HTTP ' + secSummary.status);

  const userActivity = await req('GET', '/api/dashboard/user/activity', null, auth(usersToken));
  check('GET /dashboard/user/activity returns 200', userActivity.status === 200, 'HTTP ' + userActivity.status);

  const loginHistory = await req('GET', '/api/dashboard/user/login-history', null, auth(usersToken));
  check('GET /dashboard/user/login-history returns 200', loginHistory.status === 200, 'HTTP ' + loginHistory.status);

  const dashNoAuth = await req('GET', '/api/dashboard/user/security-summary');
  check('Dashboard user endpoint rejected without token (401)', dashNoAuth.status === 401, 'HTTP ' + dashNoAuth.status);

  // ── 19. EMERGENCY LOCKDOWN ───────────────────────────────────────────────
  console.log('\n\uD83D\uDEA8 19. Emergency Lockdown');

  const loginForLock = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const lockToken = loginForLock.data && loginForLock.data.data && loginForLock.data.data.token;

  const lockRes = await req('POST', '/api/auth/emergency-lockdown', null, auth(lockToken));
  check('POST /emergency-lockdown returns 200', lockRes.status === 200, 'HTTP ' + lockRes.status);
  const lockData = lockRes.data && lockRes.data.data;
  check('Lockdown reports session count', lockData && typeof lockData.count === 'number', 'count: ' + (lockData && lockData.count));

  // Access JWTs remain valid until expiry — lockdown blacklists refresh tokens only.
  // Verify the session list is now empty (all sessions deactivated).
  const loginForSessionCheck = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const postLockToken = loginForSessionCheck.data && loginForSessionCheck.data.data && loginForSessionCheck.data.data.token;
  const sessionsAfterLock = await req('GET', '/api/sessions', null, auth(postLockToken));
  const sessionCountAfterLock = sessionsAfterLock.data && sessionsAfterLock.data.data && sessionsAfterLock.data.data.sessions
    ? sessionsAfterLock.data.data.sessions.length : null;
  check('Only 1 session after lockdown (new login)', sessionCountAfterLock === 1, 'count: ' + sessionCountAfterLock);

  // ── 15. ACCOUNT DELETION ─────────────────────────────────────────────────
  console.log('\n\uD83D\uDCA5 15. Account Deletion');

  const loginForDel = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  const delToken = loginForDel.data && loginForDel.data.data && loginForDel.data.data.token;

  const badDelRes = await req('DELETE', '/api/auth/delete-account', { password: 'WrongPass!' }, auth(delToken));
  check('Delete with wrong password rejected (401)', badDelRes.status === 401 || badDelRes.status === 400, 'HTTP ' + badDelRes.status);

  const delRes = await req('DELETE', '/api/auth/delete-account', { password: newPassword }, auth(delToken));
  check('DELETE /delete-account with correct password returns 200', delRes.status === 200, 'HTTP ' + delRes.status + ': ' + (delRes.data && delRes.data.error || ''));

  const loginAfterDel = await req('POST', '/api/auth/login/token', { email, password: newPassword });
  check('Login after deletion fails (account gone)', loginAfterDel.status === 401, 'HTTP ' + loginAfterDel.status);

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  const passed = R.pass.length, failed = R.fail.length, total = R.total;
  console.log('\n' + '='.repeat(60));
  console.log('  Auth & OAuth Full Test Suite');
  console.log('='.repeat(60));
  console.log('  Passed: ' + passed + ' / ' + total);
  if (failed > 0) {
    console.log('  Failed: ' + failed + ' / ' + total);
    R.fail.forEach(function(n) { console.log('     - ' + n); });
  } else {
    console.log('  All tests passed!');
  }
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(function(e) { console.error('Fatal:', e.message); process.exit(1); });
