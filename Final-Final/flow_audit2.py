"""
Flow audit v2 — corrected column indexes + auth code TTL check
"""
import sys, re
from docx import Document

sys.stdout.reconfigure(encoding='utf-8')
DOC_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx"
doc = Document(DOC_PATH)
paras = doc.paragraphs
full_text = '\n'.join(p.text for p in paras)

issues  = []
ok_list = []
notes   = []
def flag(label, detail): issues.append(f'  FAIL [{label}]: {detail}')
def good(label, detail=''): ok_list.append(f'  OK   [{label}]: {detail}')
def note(label, detail): notes.append(f'  NOTE [{label}]: {detail}')

t7 = doc.tables[7]

# ── T7 Column layout:
#   Col[0]=Endpoint, Col[1]=Time Window, Col[2]=Max Requests, Col[3]=HTTP Status, Col[4]=Desc
# ── Correct row mapping (from actual dump):
#   R1=login, R2=register, R3=forgot-pw, R4=refresh-token,
#   R5=oauth/authorize, R6=oauth/token, R7=introspect, R8=revoke, R9=userinfo, R10=general

print('=== T7 RATE LIMIT — CORRECTED COLUMN AUDIT ===')
# Format: (row, window_col=1, window_expected, max_col=2, max_expected, label)
t7_checks = [
    (1,  '15 min', '5',   'login:       5/15min'),
    (2,  '1 hour', '5',   'register:    5/60min'),
    (3,  '1 hour', '5',   'forgot-pw:   5/60min'),
    (4,  '15 min', '10',  'refresh-tok: 10/15min'),
    (5,  '15 min', '30',  'authorize:   30/15min'),
    (6,  '15 min', '10',  'token:       10/15min'),
    (7,  '15 min', '20',  'introspect:  20/15min'),
    (8,  '15 min', '20',  'revoke:      20/15min'),
    (9,  '1 min',  '60',  'userinfo:    60/1min'),
    (10, '15 min', '100', 'general:     100/15min'),
]
for ri, exp_window, exp_max, label in t7_checks:
    actual_window = t7.rows[ri].cells[1].text.strip()
    actual_max    = t7.rows[ri].cells[2].text.strip()
    endpoint      = t7.rows[ri].cells[0].text.strip()[:35]
    w_ok = exp_window in actual_window
    m_ok = exp_max    in actual_max
    if w_ok and m_ok:
        good(label, f'{endpoint} | window="{actual_window}" max="{actual_max}"')
    else:
        if not w_ok:
            flag(label, f'window: expected "{exp_window}" | actual "{actual_window}" ({endpoint})')
        if not m_ok:
            flag(label, f'max: expected "{exp_max}" | actual "{actual_max}" ({endpoint})')

# ── Also verify T7 R4 endpoint name says refresh-token (not just refresh)
r4_endpoint = t7.rows[4].cells[0].text.strip()
print(f'\n  T7 R4 endpoint text: "{r4_endpoint}"')
if 'refresh' in r4_endpoint.lower():
    good('T7 R4 refresh endpoint', f'contains "refresh" ✓')
    if 'refresh-token' in r4_endpoint.lower() or 'refresh (token)' in r4_endpoint.lower():
        good('T7 R4 refresh name', f'mentions refresh-token correctly')
    else:
        note('T7 R4 refresh name', f'says "{r4_endpoint}" — actual route is /api/auth/refresh-token')

# ── Auth code TTL ─────────────────────────────────────────────────────────────
print('\n=== OAUTH AUTH CODE TTL (code: 2 minutes) ===')
# Search various phrasings
patterns = [
    r'2\s*(?:นาที|minute|min)',
    r'authorization.*code.*(?:expire|หมด|TTL|อายุ)',
    r'(?:expire|หมด|TTL|อายุ).*authorization.*code',
    r'auth.*code.*2',
    r'2.*auth.*code',
]
found_ttl = False
for pat in patterns:
    if re.search(pat, full_text, re.IGNORECASE):
        # Find which paragraph
        for i, p in enumerate(paras):
            if re.search(pat, p.text, re.IGNORECASE):
                print(f'  para[{i}]: {p.text[:140]}')
                found_ttl = True
                break

if found_ttl:
    good('OAuth auth code 2min TTL', 'mentioned in doc')
else:
    flag('OAuth auth code 2min TTL', 'code uses 2min TTL but doc does not mention it')

# ── T5 R2 Refresh token expiry ────────────────────────────────────────────────
print('\n=== TABLE[5] REFRESH TOKEN EXPIRY ===')
t5 = doc.tables[5]
r2 = t5.rows[2]
cells = [c.text.strip() for c in r2.cells]
print(f'  T5 R2: {cells}')
# Code: access = 1h (or 30d remember), oauth refresh = 30d, regular refresh = 30d
# Document says: "30 days (session) / 1 hr (OAuth)" — this is WRONG
# oauth.service.js generateRefreshToken → expiresIn: '30d'
# auth.service.js generateRefreshToken → expiresIn: '30d'
# So OAuth refresh token IS 30d, same as regular.
# "1 hr (OAuth)" in the doc description is wrong.
if '30 days' in cells[2] or '30d' in cells[2] or '30 วัน' in cells[2]:
    good('T5 R2 refresh 30d', f'30d mentioned ✓')
else:
    flag('T5 R2 refresh 30d', f'expected 30d | actual "{cells[2][:80]}"')

if '1 hr (OAuth)' in cells[2] or '1 hour.*oauth' in cells[2].lower():
    flag('T5 R2 refresh OAuth expiry', f'says "1 hr (OAuth)" but oauth.service generateRefreshToken is 30d, not 1h')
    print(f'  >>> ISSUE: T5 R2 Col[2] = "{cells[2]}" — OAuth refresh token is 30d in code, not 1hr')
elif '1 hr' in cells[2] or '1 hour' in cells[2].lower():
    print(f'  T5 R2 Col[2] = "{cells[2]}" — check if "1 hr" applies to refresh token')
    note('T5 R2 refresh expiry', f'contains "1 hr": "{cells[2][:80]}" — verify vs code: oauth refresh=30d')

# ── Table[5] Access token expiry: 1h or 30d? ────────────────────────────────
print('\n=== TABLE[5] ACCESS TOKEN EXPIRY ===')
r2_access = t5.rows[2].cells[1].text.strip()
print(f'  T5 R2 Col[1] (Access Token expiry) = "{r2_access}"')
# auth.service.js createToken: remember=false → 1h, remember=true → 30d
# OAuth access token: 1h always (generateAccessToken uses expiresIn: '1h')
if '1 hour' in r2_access or '1h' in r2_access or '3,600' in r2_access:
    good('T5 access token 1h', f'✓ "{r2_access}"')
else:
    flag('T5 access token 1h', f'expected "1 hour" | actual "{r2_access}"')

# ── T3 column audit (simpler table) ──────────────────────────────────────────
print('\n=== T3 RATE LIMIT AUDIT ===')
t3 = doc.tables[3]
t3_checks = [
    (1, '/api/auth/login',          '5',  '15',  'login 5/15min'),
    (2, '/api/auth/register',       '5',  '60',  'register 5/60min'),
    (3, '/api/oauth/token',         '10', '15',  'token 10/15min'),
    (4, '/api/auth/forgot-password','5',  '60',  'forgot-pw 5/60min'),
    (5, '/api/oauth/authorize',     '30', '15',  'authorize 30/15min'),
    (6, '/api/oauth/introspect',    '20', '15',  'introspect 20/15min'),
    (7, '/api/oauth/revoke',        '20', '15',  'revoke 20/15min'),
    (8, 'ทั่วไป',                   '100','15',  'general 100/15min'),
]
for ri, endpoint_kw, exp_max, exp_window, label in t3_checks:
    row = t3.rows[ri]
    endpoint = row.cells[0].text.strip()
    max_val  = row.cells[1].text.strip()
    window   = row.cells[2].text.strip()
    if exp_max in max_val and exp_window in window:
        good(f'T3 {label}', f'"{endpoint}" max={max_val} window={window}')
    else:
        if exp_max not in max_val:
            flag(f'T3 {label} max', f'expected "{exp_max}" | actual "{max_val}" ({endpoint})')
        if exp_window not in window:
            flag(f'T3 {label} window', f'expected "{exp_window}" | actual "{window}" ({endpoint})')

# Note: T3 is missing refresh-token limiter entry
t3_endpoints = [t3.rows[ri].cells[0].text.strip() for ri in range(1, len(t3.rows))]
has_refresh_in_t3 = any('refresh' in e.lower() for e in t3_endpoints)
if not has_refresh_in_t3:
    note('T3 missing refresh-token', 'T3 has no row for /api/auth/refresh-token (10/15min) — only T7 covers it')

# ── Tier limits in T7 ─────────────────────────────────────────────────────────
print('\n=== TIER RATE LIMITS (code: free=100, auth=500, premium=2000, admin=10000) ===')
tier_checks = [
    (11, '500',    'authenticated 500/15min'),
    (12, '2,000',  'premium 2000/15min'),
    (13, '10,000', 'admin 10000/15min'),
]
for ri, exp, label in tier_checks:
    try:
        actual = t7.rows[ri].cells[2].text.strip()
        if exp in actual:
            good(f'Tier {label}', f'"{exp}" ✓')
        else:
            flag(f'Tier {label}', f'expected "{exp}" | actual "{actual}"')
    except IndexError:
        note(f'Tier {label}', 'Row not found')

# ── OAuth flow: authorize GET vs POST ────────────────────────────────────────
print('\n=== OAUTH AUTHORIZE: GET + POST both exist ===')
t2 = doc.tables[2]
# R31 should be POST /api/oauth/authorize, R44 should be GET /api/oauth/authorize
r31_method = t2.rows[31].cells[1].text.strip()
r31_path   = t2.rows[31].cells[2].text.strip()
r44_method = t2.rows[44].cells[1].text.strip()
r44_path   = t2.rows[44].cells[2].text.strip()
print(f'  R31: {r31_method} {r31_path}')
print(f'  R44: {r44_method} {r44_path}')
if r31_method == 'POST' and '/api/oauth/authorize' in r31_path:
    good('OAuth POST /authorize', 'R31 ✓')
else:
    flag('OAuth POST /authorize', f'R31: "{r31_method} {r31_path}"')
if r44_method == 'GET' and '/api/oauth/authorize' in r44_path:
    good('OAuth GET /authorize', 'R44 ✓')
else:
    flag('OAuth GET /authorize', f'R44: "{r44_method} {r44_path}"')

# ── Emergency lockdown rate limit ────────────────────────────────────────────
print('\n=== EMERGENCY LOCKDOWN RATE LIMIT ===')
# Code: generalLimiter (100/15min) applies to emergency-lockdown
# Document para[732]: "Emergency Lockdown: 100 requests / 15 นาที"
for i, p in enumerate(paras):
    if 'emergency' in p.text.lower() and 'lockdown' in p.text.lower():
        print(f'  para[{i}]: {p.text[:140]}')

# Check if doc mentions it uses general limiter
if re.search(r'emergency.*lockdown.*100|100.*emergency.*lockdown', full_text, re.IGNORECASE):
    good('Emergency lockdown 100/15min', 'mentioned in doc ✓')
else:
    note('Emergency lockdown', 'check doc mentions correct rate limit for this endpoint')

# ── Middleware: token from header OR query param ──────────────────────────────
print('\n=== AUTHENTICATE: header OR query.token ===')
# Code: let token = req.headers['authorization'] || req.query.token
if re.search(r'query.*token|token.*query|query parameter', full_text, re.IGNORECASE):
    good('Auth middleware query.token', 'query param auth mentioned')
else:
    note('Auth middleware query.token', 'authenticate.js also accepts ?token= query param; doc may not describe this')

# ── Delete client: soft delete (isActive=false), not hard delete ─────────────
print('\n=== DELETE CLIENT: SOFT DELETE ===')
t2_r30 = t2.rows[30]
r30_desc = t2_r30.cells[4].text.strip()
print(f'  T2 R30 DELETE /clients/:id desc: "{r30_desc}"')
if 'soft' in r30_desc.lower() or 'deactivat' in r30_desc.lower() or 'isActive' in r30_desc:
    good('Delete client soft delete', f'✓ "{r30_desc}"')
else:
    note('Delete client soft delete', f'Code does soft delete (isActive=false); desc="{r30_desc}"')

# ── REPORT ────────────────────────────────────────────────────────────────────
print('\n' + '='*70)
print(f'RESULT: {len(issues)} FAIL | {len(ok_list)} OK | {len(notes)} NOTE')
print('='*70)

if issues:
    print('\n--- FAILURES ---')
    for x in issues: print(x)
if notes:
    print('\n--- NOTES ---')
    for x in notes: print(x)
print(f'\n--- OK ({len(ok_list)}) ---')
for x in ok_list: print(x)
