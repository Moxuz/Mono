import sys
sys.stdout.reconfigure(encoding='utf-8')
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()

HEADER_FILL = PatternFill('solid', fgColor='1F4E79')
HEADER_FONT = Font(bold=True, color='FFFFFF', size=11)
SUBHDR_FILL = PatternFill('solid', fgColor='2E75B6')
SUBHDR_FONT = Font(bold=True, color='FFFFFF', size=11)
ALT_FILL    = PatternFill('solid', fgColor='DEEAF1')
NORMAL_FONT = Font(size=11)
CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)
LEFT   = Alignment(horizontal='left',   vertical='center', wrap_text=True)
thin   = Side(border_style='thin', color='000000')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

def style_header(ws, row, cols, fill=None, font=None):
    fill = fill or HEADER_FILL
    font = font or HEADER_FONT
    for col in range(1, cols+1):
        c = ws.cell(row=row, column=col)
        c.fill = fill; c.font = font; c.alignment = CENTER; c.border = BORDER

def set_widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

# ── Sheet 1: API Endpoints ─────────────────────────────────────────────────
ws1 = wb.active
ws1.title = 'API Endpoints'
ws1.row_dimensions[1].height = 28
ws1.append(['Category', 'Method', 'Path', 'Auth', 'Description'])
style_header(ws1, 1, 5)

api_data = [
    ('Auth Core',    'POST',   '/api/auth/register',                'No',     'Register new user'),
    ('Auth Core',    'POST',   '/api/auth/login',                   'No',     'Login, get access+refresh tokens'),
    ('Auth Core',    'POST',   '/api/auth/logout',                  'Yes',    'Logout, blacklist tokens'),
    ('Auth Core',    'POST',   '/api/auth/refresh',                 'No',     'Exchange refresh token for new access token'),
    ('Auth Core',    'GET',    '/api/auth/profile',                 'Yes',    'Get current user profile'),
    ('Auth Core',    'PUT',    '/api/auth/profile',                 'Yes',    'Update user profile'),
    ('Auth Core',    'GET',    '/api/auth/preferences',             'Yes',    'Get preferences (theme, language, notifications)'),
    ('Auth Core',    'PUT',    '/api/auth/preferences',             'Yes',    'Update preferences'),
    ('Auth Core',    'DELETE', '/api/auth/delete-account',          'Yes',    'Delete account (requires password confirmation)'),
    ('Password',     'POST',   '/api/auth/forgot-password',         'No',     'Send password reset link via email'),
    ('Password',     'POST',   '/api/auth/reset-password/:token',   'No',     'Reset password using reset token'),
    ('Password',     'PUT',    '/api/auth/change-password',         'Yes',    'Change password (requires current password)'),
    ('Email',        'POST',   '/api/auth/resend-verification',     'Yes',    'Resend email verification link'),
    ('Email',        'GET',    '/api/auth/verify-email/:token',     'No',     'Verify email address with token'),
    ('PDPA',         'POST',   '/api/auth/update-cookie-consent',   'Yes',    'Record cookie consent (PDPA s.19)'),
    ('PDPA',         'GET',    '/api/auth/export-data',             'Yes',    'Export personal data as JSON (PDPA s.27)'),
    ('Audit',        'GET',    '/api/auth/audit-logs',              'Yes',    'Get own audit logs'),
    ('Audit',        'GET',    '/api/auth/security-audit',          'Yes',    'Get security audit events'),
    ('Sessions',     'GET',    '/api/auth/sessions',                'Yes',    'List all active sessions'),
    ('Sessions',     'DELETE', '/api/auth/sessions/:id',            'Yes',    'Revoke a specific session'),
    ('Sessions',     'DELETE', '/api/auth/sessions',                'Yes',    'Revoke all sessions (logout all devices)'),
    ('Social Login', 'GET',    '/api/auth/google',                  'No',     'Start Google OAuth flow'),
    ('Social Login', 'GET',    '/api/auth/google/callback',         'No',     'Google OAuth callback handler'),
    ('Social Login', 'GET',    '/api/auth/github',                  'No',     'Start GitHub OAuth flow'),
    ('Social Login', 'GET',    '/api/auth/github/callback',         'No',     'GitHub OAuth callback handler'),
    ('OAuth 2.0',    'POST',   '/api/oauth/clients',                'Yes',    'Register a new OAuth 2.0 client'),
    ('OAuth 2.0',    'GET',    '/api/oauth/clients',                'Yes',    'List all OAuth clients owned by user'),
    ('OAuth 2.0',    'GET',    '/api/oauth/clients/:id',            'Yes',    'Get OAuth client details by ID'),
    ('OAuth 2.0',    'PUT',    '/api/oauth/clients/:id',            'Yes',    'Update OAuth client metadata'),
    ('OAuth 2.0',    'DELETE', '/api/oauth/clients/:id',            'Yes',    'Delete (soft) an OAuth client'),
    ('OAuth 2.0',    'POST',   '/api/oauth/authorize',              'No',     'Authorization endpoint - PKCE flow with credentials'),
    ('OAuth 2.0',    'POST',   '/api/oauth/token',                  'No',     'Token endpoint - code exchange or refresh_token grant'),
    ('OAuth 2.0',    'GET',    '/api/oauth/userinfo',               'Bearer', 'OIDC UserInfo endpoint'),
    ('OAuth 2.0',    'POST',   '/api/oauth/introspect',             'Client', 'Token introspection (RFC 7662)'),
    ('OAuth 2.0',    'POST',   '/api/oauth/revoke',                 'Bearer', 'Token revocation (RFC 7009)'),
    ('User/Admin',   'GET',    '/api/users',                        'Admin',  'List all users (admin only)'),
    ('User/Admin',   'GET',    '/api/users/me',                     'Yes',    'Alias for /profile'),
    ('User/Admin',   'GET',    '/api/users/:id',                    'Admin',  'Get any user by ID (admin only)'),
    ('User/Admin',   'PUT',    '/api/users/:id/role',               'Admin',  'Change user role (admin only)'),
    ('User/Admin',   'DELETE', '/api/users/:id',                    'Admin',  'Delete any user (admin only)'),
    ('Well-Known',   'GET',    '/.well-known/openid-configuration', 'No',     'OIDC Discovery Document (RFC 8414)'),
    ('Well-Known',   'GET',    '/.well-known/jwks.json',            'No',     'JSON Web Key Set - public signing keys'),
    ('Health',       'GET',    '/health',                            'No',     'Server health check'),
    ('Health',       'GET',    '/api/auth/silent-auth',             'No',     'Silent re-authentication (iframe / SPA)'),
]

color_map = {'GET': '2196F3', 'POST': '4CAF50', 'PUT': 'FF9800', 'DELETE': 'F44336'}
for i, (cat, method, path, auth, desc) in enumerate(api_data, 2):
    alt = (i % 2 == 0)
    row_fill = ALT_FILL if alt else PatternFill()
    for j, v in enumerate([cat, method, path, auth, desc], 1):
        c = ws1.cell(i, j, v)
        c.font = NORMAL_FONT; c.alignment = LEFT; c.border = BORDER
        c.fill = row_fill
    mc = ws1.cell(i, 2)
    mc.fill = PatternFill('solid', fgColor=color_map.get(method, 'AAAAAA'))
    mc.font = Font(bold=True, color='FFFFFF', size=11)
    mc.alignment = CENTER

set_widths(ws1, [14, 9, 44, 10, 42])

# ── Sheet 2: JWT Configuration ─────────────────────────────────────────────
ws2 = wb.create_sheet('Table 3.2 JWT Config')
ws2.row_dimensions[1].height = 28
ws2.append(['Parameter', 'Access Token', 'Refresh Token', 'Notes'])
style_header(ws2, 1, 4)
jwt_rows = [
    ('Algorithm',          'RS256 (RSA 2048-bit)',       'RS256 (RSA 2048-bit)',               'Asymmetric - verifiable with public key'),
    ('Expiry',             '1 hour (3,600 s)',            '30 days (session) / 1 hr (OAuth)',   'OAuth refresh token intentionally shorter'),
    ('Claims (Payload)',   'sub, role, email, iat, exp',  'sub, type, iat, exp',                'OAuth tokens add: scope, client_id'),
    ('Client Storage',     'Memory / localStorage',       'HTTP-only cookie',                   'HTTP-only cookie prevents XSS access'),
    ('Rotation Policy',    'N/A (short-lived)',            'One-time use - rotated every call',  'Old refresh token invalidated immediately'),
    ('Blacklisting',       'MongoDB TokenBlacklist',      'MongoDB TokenBlacklist',             'Both tokens blacklisted on logout'),
    ('Private Key Source', 'process.env.JWT_PRIVATE_KEY', 'process.env.JWT_PRIVATE_KEY',        'Never committed to git'),
    ('Public Key Expose',  'JWKS endpoint',               'JWKS endpoint',                      '/.well-known/jwks.json'),
]
for i, row in enumerate(jwt_rows, 2):
    alt = (i % 2 == 0)
    row_fill = ALT_FILL if alt else PatternFill()
    for j, v in enumerate(row, 1):
        c = ws2.cell(i, j, v)
        c.fill = row_fill; c.font = NORMAL_FONT; c.alignment = LEFT; c.border = BORDER
set_widths(ws2, [24, 30, 36, 36])

# ── Sheet 3: Rate Limiting ─────────────────────────────────────────────────
ws3 = wb.create_sheet('Table 3.3 Rate Limiting')
ws3.row_dimensions[1].height = 28
ws3.append(['Endpoint / Group', 'Time Window', 'Max Requests', 'HTTP Status', 'Purpose'])
style_header(ws3, 1, 5)
rl_rows = [
    ('POST /api/auth/login',               '15 min',   '10',   '429', 'Prevent brute-force password attacks'),
    ('POST /api/auth/register',            '1 hour',   '5',    '429', 'Prevent automated account spam'),
    ('POST /api/auth/forgot-password',     '1 hour',   '3',    '429', 'Prevent email flooding / abuse'),
    ('POST /api/auth/resend-verification', '1 hour',   '3',    '429', 'Prevent email flooding'),
    ('/api/oauth/* (all OAuth routes)',    '15 min',   '100',  '429', 'OAuth endpoint protection'),
    ('Global (all routes fallback)',       '15 min',   '1000', '429', 'Global fallback rate limit'),
    ('GET /health',                        'Unlimited', '-',    '-',   'Health check - not rate-limited'),
]
for i, row in enumerate(rl_rows, 2):
    alt = (i % 2 == 0)
    row_fill = ALT_FILL if alt else PatternFill()
    for j, v in enumerate(row, 1):
        c = ws3.cell(i, j, v)
        c.fill = row_fill; c.font = NORMAL_FONT; c.border = BORDER
        c.alignment = CENTER if j in (2, 3, 4) else LEFT
set_widths(ws3, [38, 14, 15, 14, 38])

# ── Sheet 4: PDPA Compliance ───────────────────────────────────────────────
ws4 = wb.create_sheet('Table 3.4 PDPA')
ws4.row_dimensions[1].height = 28
ws4.append(['PDPA Section', 'Right / Obligation', 'TAS Implementation', 'API Endpoint'])
style_header(ws4, 1, 4)
pdpa_rows = [
    ('Section 19', 'Consent (right to give/withdraw)',
     'cookieConsentAccepted boolean in User model with consentTimestamp; every change logged to audit',
     'POST /api/auth/update-cookie-consent'),
    ('Section 27', 'Right to Access and Data Portability',
     'Full user data exported as structured JSON (profile, sessions, audit logs, preferences)',
     'GET /api/auth/export-data'),
    ('Section 28', 'Right to Rectification',
     'User can update username, email, and preferences at any time',
     'PUT /api/auth/profile\nPUT /api/auth/preferences'),
    ('Section 33', 'Right to Erasure (Right to be Forgotten)',
     'Hard delete: User document + all Sessions + TokenBlacklist entries + OAuthCodes removed atomically',
     'DELETE /api/auth/delete-account'),
    ('Section 37', 'Record of Processing Activities',
     'SecurityAuditLog MongoDB collection records all auth events with IP, timestamp, action, user ID',
     'GET /api/auth/audit-logs\nGET /api/auth/security-audit'),
    ('Section 40', 'Appropriate Security Measures',
     'bcrypt cost-12, HTTPS, Helmet.js security headers, rate-limiting, JWT RS256, PKCE S256',
     'Applied globally to all endpoints'),
]
for i, row in enumerate(pdpa_rows, 2):
    alt = (i % 2 == 0)
    row_fill = ALT_FILL if alt else PatternFill()
    for j, v in enumerate(row, 1):
        c = ws4.cell(i, j, v)
        c.fill = row_fill; c.font = NORMAL_FONT; c.alignment = LEFT; c.border = BORDER
    ws4.row_dimensions[i].height = 52
set_widths(ws4, [16, 28, 52, 42])

# ── Sheet 5: Performance Test Template ────────────────────────────────────
ws5 = wb.create_sheet('Perf Test 4.2.3')
ws5.row_dimensions[1].height = 28
hdrs = ['Scenario', 'Concurrent Users', 'Total Requests', 'Avg Response (ms)',
        'P95 Response (ms)', 'Error Rate (%)', 'Throughput (req/s)', 'Pass/Fail']
ws5.append(hdrs)
style_header(ws5, 1, 8)
GREY_FILL = PatternFill('solid', fgColor='F2F2F2')
GREY_FONT = Font(color='999999', italic=True, size=11)
perf_scenarios = [
    ('POST /api/auth/login',          100,   1000),
    ('POST /api/auth/login',          500,   5000),
    ('POST /api/auth/login',         1000,  10000),
    ('GET /api/auth/profile',         100,   1000),
    ('GET /api/auth/profile',         500,   5000),
    ('POST /api/oauth/token',         100,   1000),
    ('POST /api/oauth/token',         500,   5000),
    ('Mixed (login+profile+token)',   500,   5000),
]
for i, (scen, cu, total_r) in enumerate(perf_scenarios, 2):
    alt = (i % 2 == 0)
    row_fill = ALT_FILL if alt else PatternFill()
    ws5.cell(i, 1, scen).fill = row_fill
    ws5.cell(i, 1).font = NORMAL_FONT; ws5.cell(i, 1).alignment = LEFT; ws5.cell(i, 1).border = BORDER
    ws5.cell(i, 2, cu).fill = row_fill
    ws5.cell(i, 2).font = NORMAL_FONT; ws5.cell(i, 2).alignment = CENTER; ws5.cell(i, 2).border = BORDER
    ws5.cell(i, 3, total_r).fill = row_fill
    ws5.cell(i, 3).font = NORMAL_FONT; ws5.cell(i, 3).alignment = CENTER; ws5.cell(i, 3).border = BORDER
    for j in range(4, 9):
        c = ws5.cell(i, j)
        c.fill = GREY_FILL; c.font = GREY_FONT
        c.value = '(fill after k6 run)'; c.alignment = CENTER; c.border = BORDER
set_widths(ws5, [36, 18, 16, 20, 20, 16, 20, 12])

# ── Sheet 6: Updated Test Breakdown (116 tests) ────────────────────────────
ws6 = wb.create_sheet('Table 2 Test Breakdown')
ws6.row_dimensions[1].height = 28
ws6.append(['No.', 'Test File', 'describe Block', 'Test Cases', 'Result'])
style_header(ws6, 1, 5)
tests = [
    (1,  '1-auth-core.test.js',     'Register',                   6),
    (2,  '1-auth-core.test.js',     'Login',                      6),
    (3,  '1-auth-core.test.js',     'Refresh Token',              4),
    (4,  '1-auth-core.test.js',     'Logout',                     4),
    (5,  '2-auth-password.test.js', 'Forgot Password',            4),
    (6,  '2-auth-password.test.js', 'Reset Password',             5),
    (7,  '2-auth-password.test.js', 'Change Password',            5),
    (8,  '3-auth-sessions.test.js', 'List Sessions',              3),
    (9,  '3-auth-sessions.test.js', 'Revoke Single Session',      3),
    (10, '3-auth-sessions.test.js', 'Revoke All Sessions',        3),
    (11, '4-auth-profile.test.js',  'Get Profile',                3),
    (12, '4-auth-profile.test.js',  'Preferences',                4),
    (13, '4-auth-profile.test.js',  'Cookie Consent',             4),
    (14, '4-auth-profile.test.js',  'Audit Logs',                 3),
    (15, '4-auth-profile.test.js',  'Delete Account',             4),
    (16, '5-oauth.test.js',         'Client Registration',        4),
    (17, '5-oauth.test.js',         'Client CRUD',                5),
    (18, '5-oauth.test.js',         'OAuth PKCE Auth + Token',    5),
    (19, '5-oauth.test.js',         'Userinfo',                   3),
    (20, '5-oauth.test.js',         'Introspect',                 3),
    (21, '5-oauth.test.js',         'Revoke Token',               2),
    (22, '5-oauth.test.js',         'Scope Enforcement',          2),
    (23, '6-security.test.js',      'NoSQL Injection Prevention', 4),
    (24, '6-security.test.js',      'Rate Limiting',              4),
    (25, '6-security.test.js',      'CORS & Security Headers',    4),
    (26, '6-security.test.js',      'Token Security',             3),
    (27, '6-security.test.js',      'Input Validation',           4),
]
total = sum(r[3] for r in tests)
GREEN_F = PatternFill('solid', fgColor='C6EFCE')
GREEN_N = Font(bold=True, color='375623', size=11)
for i, (no, file, desc, count) in enumerate(tests, 2):
    alt = (i % 2 == 0)
    row_fill = ALT_FILL if alt else PatternFill()
    for j, v in enumerate([no, file, desc, count, 'PASS'], 1):
        c = ws6.cell(i, j, v)
        c.fill = row_fill; c.font = NORMAL_FONT; c.alignment = LEFT; c.border = BORDER
    ws6.cell(i, 1).alignment = CENTER
    ws6.cell(i, 4).alignment = CENTER
    p = ws6.cell(i, 5)
    p.fill = GREEN_F; p.font = GREEN_N; p.alignment = CENTER; p.border = BORDER

tr = len(tests) + 2
for col in range(1, 6):
    c = ws6.cell(tr, col)
    c.fill = SUBHDR_FILL; c.font = SUBHDR_FONT; c.alignment = CENTER; c.border = BORDER
ws6.cell(tr, 1, 'TOTAL')
ws6.cell(tr, 3, 'All 27 describe blocks')
ws6.cell(tr, 4, total)
ws6.cell(tr, 5, f'{total}/{total} PASS')
set_widths(ws6, [6, 30, 36, 14, 16])

wb.save('TAS-Tables.xlsx')
print(f'TAS-Tables.xlsx saved. Total test cases: {total}')
