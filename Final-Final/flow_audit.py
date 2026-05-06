"""
Deep flow audit: extract what the document SAYS about each flow,
then compare against actual code behavior.
Covers: login, register, refresh, OAuth PKCE, session, middleware, rate limits, lockout
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

def find_paras(keywords, context=3):
    """Find paragraphs containing ALL keywords, print with context."""
    hits = []
    kws = [k.lower() for k in keywords]
    for i, p in enumerate(paras):
        t = p.text.lower()
        if all(k in t for k in kws):
            hits.append(i)
    return hits

# ─────────────────────────────────────────────────────────────────────────────
# 1. ACCOUNT LOCKOUT — code: 5 attempts, 15 minutes
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 1. ACCOUNT LOCKOUT (code: 5 attempts / 15 min) ===')
# Check all rate-limit/lockout tables
t3 = doc.tables[3]
t7 = doc.tables[7]

# Check login row in T3
for ri, row in enumerate(t3.rows):
    ct = row.cells[0].text.strip()
    if 'login' in ct.lower() or 'เข้าสู่ระบบ' in ct:
        cells = [c.text.strip() for c in row.cells]
        print(f'  T3 R{ri} (login): {cells}')

# T7 login row
for ri, row in enumerate(t7.rows):
    ct = row.cells[0].text.strip()
    if 'login' in ct.lower() or 'เข้าสู่ระบบ' in ct:
        cells = [c.text.strip() for c in row.cells]
        print(f'  T7 R{ri} (login): {cells}')

# Body text about lockout
lockout_hits = find_paras(['lock', '5'])
print(f'\n  Paragraphs with lockout keywords:')
for i in lockout_hits[:8]:
    print(f'    [{i}]: {paras[i].text[:140]}')

# Check specific claims
patterns_lockout = [
    (r'5\s*(?:ครั้ง|times|attempts)', '5 attempts'),
    (r'15\s*(?:นาที|min)', '15 minutes lock'),
    (r'lock', 'lockout mentioned'),
]
for pat, label in patterns_lockout:
    if re.search(pat, full_text, re.IGNORECASE):
        good(f'Lockout {label}', 'mentioned in doc')
    else:
        flag(f'Lockout {label}', 'NOT found in document')

# ─────────────────────────────────────────────────────────────────────────────
# 2. TOKEN EXPIRY — code: access 1h (or 30d remember), refresh 30d
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 2. TOKEN EXPIRY (code: access=1h/30d, refresh=30d) ===')
t5 = doc.tables[5]
print('  Table[5] (JWT params) all rows:')
for ri, row in enumerate(t5.rows):
    cells = [c.text.strip()[:50] for c in row.cells]
    print(f'    R{ri:02d}: {cells}')

# Check specific expiry values
expiry_patterns = [
    (r'1\s*(?:hour|h|ชั่วโมง)|1h', 'access token 1h'),
    (r'30\s*(?:day|d|วัน)|30d', 'refresh token 30d'),
    (r'remember\s*me|จดจำ', 'remember me mentioned'),
]
for pat, label in expiry_patterns:
    if re.search(pat, full_text, re.IGNORECASE):
        good(f'Token expiry {label}', 'mentioned')
    else:
        flag(f'Token expiry {label}', 'NOT found')

# ─────────────────────────────────────────────────────────────────────────────
# 3. SESSION MAX & TTL — code: max=5, default TTL=90d, login=1d, remember=30d
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 3. SESSION TTL & LIMIT (code: max=5, TTL=90d/30d/1d) ===')
session_patterns = [
    (r'90\s*(?:day|d|วัน)', 'session TTL 90d'),
    (r'5\s*(?:session|เซสชัน)', 'max 5 sessions'),
    (r'session.*(?:limit|จำกัด)', 'session limit'),
    (r'1\s*(?:day|d|วัน).*session|session.*1\s*(?:day|d|วัน)', 'session 1d'),
]
for pat, label in session_patterns:
    if re.search(pat, full_text, re.IGNORECASE):
        good(f'Session {label}', 'mentioned')
    else:
        note(f'Session {label}', 'not found — may not be described')

# ─────────────────────────────────────────────────────────────────────────────
# 4. TOKEN BLACKLIST — code: checks on every request via authenticate middleware
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 4. TOKEN BLACKLIST (code: checked every request) ===')
blacklist_found = re.search(r'blacklist|token.*revok|revok.*token|บัญชีดำ|เพิกถอน.*token', full_text, re.IGNORECASE)
if blacklist_found:
    good('Token blacklist', 'mentioned in doc')
else:
    flag('Token blacklist', 'NOT described in doc')

# ─────────────────────────────────────────────────────────────────────────────
# 5. BCRYPT — code: real hash=cost10, timing dummy=cost12
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 5. BCRYPT (code: real=cost10, timing dummy=cost12) ===')
# Check body text for any cost-12 mention (should only be as timing dummy)
cost12_hits = []
for i, p in enumerate(paras):
    if re.search(r'cost.?12|bcrypt.?12|12.?round', p.text, re.IGNORECASE):
        cost12_hits.append((i, p.text[:140]))
if cost12_hits:
    for idx, txt in cost12_hits:
        note(f'bcrypt cost-12 para[{idx}]', f'Mentioned: {txt[:100]}')
        note('bcrypt context', 'cost-12 is ONLY the timing-attack dummy hash, NOT real storage')
else:
    good('bcrypt cost-12', 'Not in body text (correct — only in PDPA table as historical note)')

# Check cost-10 mentioned
if re.search(r'cost.?10|bcrypt.?10|10.?round|genSalt.*10|salt.*10', full_text, re.IGNORECASE):
    good('bcrypt cost-10', 'mentioned in doc')
else:
    flag('bcrypt cost-10', 'NOT found in document')

# ─────────────────────────────────────────────────────────────────────────────
# 6. RATE LIMITING — full table audit
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 6. RATE LIMITING (full table audit) ===')
# Code values:
# login:          5/15min, key=email+IP
# register:       5/60min
# forgot-password: 5/60min
# refresh-token:  10/15min
# token:          10/15min
# userinfo:       60/1min
# authorize:      30/15min
# introspect:     20/15min
# revoke:         20/15min
# general:        100/15min

CODE_RATE_LIMITS = {
    'login':           (5,   '15'),
    'register':        (5,   '60'),
    'forgot-password': (5,   '60'),
    'refresh-token':   (10,  '15'),
    'token':           (10,  '15'),
    'userinfo':        (60,   '1'),
    'authorize':       (30,  '15'),
    'introspect':      (20,  '15'),
    'revoke':          (20,  '15'),
    'general':         (100, '15'),
}

print('\n  Table[3] — full dump:')
for ri, row in enumerate(t3.rows):
    cells = [c.text.strip()[:50] for c in row.cells]
    print(f'    R{ri:02d}: {cells}')

print('\n  Table[7] — full dump:')
for ri, row in enumerate(t7.rows):
    cells = [c.text.strip()[:55] for c in row.cells]
    print(f'    R{ri:02d}: {cells}')

# Spot-check key values in T7
t7_checks = [
    # (row_idx, col_idx, expected, label)
    (1,  2, '5',    'T7 login max=5'),
    (1,  3, '15',   'T7 login window=15min'),
    (2,  2, '5',    'T7 register max=5'),
    (2,  3, '60',   'T7 register window=60min'),
    (3,  2, '5',    'T7 forgot-pw max=5'),
    (3,  3, '60',   'T7 forgot-pw window=60min'),
    (4,  2, '10',   'T7 refresh max=10'),
    (4,  3, '15',   'T7 refresh window=15min'),
    (5,  2, '10',   'T7 token max=10'),
    (5,  3, '15',   'T7 token window=15min'),
    (6,  2, '30',   'T7 authorize max=30'),
    (6,  3, '15',   'T7 authorize window=15min'),
    (7,  2, '20',   'T7 introspect max=20'),
    (7,  3, '15',   'T7 introspect window=15min'),
    (8,  2, '20',   'T7 revoke max=20'),
    (8,  3, '15',   'T7 revoke window=15min'),
    (9,  2, '60',   'T7 userinfo max=60'),
    (9,  1, '1 min','T7 userinfo window=1min'),
    (10, 2, '100',  'T7 general max=100'),
    (10, 3, '15',   'T7 general window=15min'),
]
for ri, ci, expected, label in t7_checks:
    try:
        actual = t7.rows[ri].cells[ci].text.strip()
        if expected in actual:
            good(label, f'"{expected}" ✓')
        else:
            flag(label, f'expected "{expected}" | actual "{actual[:50]}"')
    except IndexError:
        flag(label, f'Row/col out of range T7 R{ri}C{ci}')

# ─────────────────────────────────────────────────────────────────────────────
# 7. OAUTH PKCE FLOW — code: auth code 2min, S256 only, access 1h, refresh 30d
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 7. OAUTH PKCE FLOW ===')
oauth_patterns = [
    (r'2\s*(?:min|นาที).*(?:code|authorization)|(?:code|authorization).*2\s*(?:min|นาที)', 'auth code 2min TTL'),
    (r'S256', 'S256 only'),
    (r'plain.*(?:reject|ปฏิเสธ|ไม่รองรับ)|(?:reject|ปฏิเสธ).*plain', 'plain rejected'),
    (r'code_challenge', 'PKCE code_challenge'),
    (r'code_verifier', 'PKCE code_verifier'),
    (r'PKCE', 'PKCE mentioned'),
]
for pat, label in oauth_patterns:
    if re.search(pat, full_text, re.IGNORECASE):
        good(f'OAuth {label}', 'mentioned')
    else:
        flag(f'OAuth {label}', 'NOT found')

# Check OAuth token expiry in service: access=1h, refresh=30d
# Also check id_token is mentioned
if re.search(r'id_token|id token', full_text, re.IGNORECASE):
    good('OAuth id_token', 'mentioned in doc')
else:
    note('OAuth id_token', 'not mentioned — code generates id_token on exchange')

# ─────────────────────────────────────────────────────────────────────────────
# 8. TOKEN ROTATION — code: old refresh blacklisted, new issued on every refresh
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 8. TOKEN ROTATION ===')
rotation_patterns = [
    (r'token.*rotation|rotation.*token|หมุนเวียน.*token|token.*หมุนเวียน', 'token rotation'),
    (r'refresh.*blacklist|blacklist.*refresh|เพิกถอน.*refresh', 'refresh blacklisted on use'),
]
for pat, label in rotation_patterns:
    if re.search(pat, full_text, re.IGNORECASE):
        good(f'Rotation {label}', 'mentioned')
    else:
        note(f'Rotation {label}', 'not explicitly mentioned')

# ─────────────────────────────────────────────────────────────────────────────
# 9. TIMING ATTACK PROTECTION — code: dummy bcrypt compare when user not found
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 9. TIMING ATTACK PROTECTION ===')
timing_patterns = [
    (r'timing.*attack|timing.*safe|timing.*normal|ป้องกัน.*timing|constant.?time', 'timing attack protection'),
]
for pat, label in timing_patterns:
    if re.search(pat, full_text, re.IGNORECASE):
        good(f'Security {label}', 'mentioned')
    else:
        note(f'Security {label}', 'not explicitly mentioned')

# ─────────────────────────────────────────────────────────────────────────────
# 10. AUTHENTICATE MIDDLEWARE — code: checks blacklist → verify JWT → find user → session
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 10. AUTHENTICATE MIDDLEWARE FLOW ===')
auth_flow_patterns = [
    (r'blacklist.*(?:ก่อน|check|ตรวจ)|(?:ตรวจ|check).*blacklist', 'blacklist check first'),
    (r'Bearer\s+token|Authorization.*header', 'Bearer header'),
    (r'jwt\.verify|ตรวจสอบ.*JWT|JWT.*ตรวจสอบ', 'JWT verify'),
    (r'session.*(?:update|อัปเดต)|(?:update|อัปเดต).*session', 'session update on request'),
]
for pat, label in auth_flow_patterns:
    if re.search(pat, full_text, re.IGNORECASE):
        good(f'Middleware {label}', 'mentioned')
    else:
        note(f'Middleware {label}', 'not explicitly mentioned')

# ─────────────────────────────────────────────────────────────────────────────
# 11. API TABLE AUTH COLUMN — verify auth values match middleware
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 11. API TABLE AUTH COLUMN ===')
t2 = doc.tables[2]

# Known correct auth values from code
# (row, expected_auth, note)
auth_col_checks = [
    (1,  'No',      'register — no auth needed'),
    (2,  'No',      'login — no auth needed'),
    (3,  'Yes',     'logout — needs token'),
    (4,  'No',      'refresh-token — uses refresh token in body, no Bearer'),
    (5,  'Yes',     'GET profile — needs auth'),
    (6,  'Yes',     'PUT profile — needs auth'),
    (9,  'Yes',     'delete-account — needs auth'),
    (10, 'No',      'forgot-password — no auth'),
    (11, 'No',      'reset-password — uses reset token param, not Bearer'),
    (12, 'Yes',     'change-password — needs auth'),
    (13, 'No',      'validate-token — no auth (takes token in body)'),
    (15, 'Yes',     'update-cookie-consent — needs auth'),
    (16, 'Yes',     'export — needs auth'),
    (17, 'Yes',     'audit-logs — needs auth'),
    (26, 'Yes',     'POST /oauth/clients — needs auth'),
    (31, 'No',      'POST /oauth/authorize — no prior Bearer; uses session cookie'),
    (32, 'No',      'POST /oauth/token — client_secret, not Bearer'),
    (33, 'Bearer',  'GET /oauth/userinfo — Bearer token'),
    (34, 'Client',  'POST /oauth/introspect — client credentials'),
    (35, 'Bearer',  'POST /oauth/revoke — Bearer'),
    (36, 'Admin',   'GET /api/users — admin only'),
    (43, 'No',      '/health — public'),
]

for ri, expected, comment in auth_col_checks:
    actual = t2.rows[ri].cells[3].text.strip()
    path   = t2.rows[ri].cells[2].text.strip()
    if expected in actual:
        good(f'Auth R{ri:02d} ({path})', f'"{expected}" ✓')
    else:
        flag(f'Auth R{ri:02d} ({path})', f'expected "{expected}" | actual "{actual}" — {comment}')

# ─────────────────────────────────────────────────────────────────────────────
# 12. SESSION STORAGE — code: stores SHA256 hash, not raw token
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 12. SESSION STORAGE ===')
hash_storage_found = re.search(r'hash.*token|SHA.?256.*session|session.*hash|token.*hash', full_text, re.IGNORECASE)
if hash_storage_found:
    good('Session token storage', 'hash mentioned in doc')
else:
    note('Session token storage', 'doc may not describe that only token HASH is stored (not raw token)')

# ─────────────────────────────────────────────────────────────────────────────
# 13. WELL-KNOWN — code: HS256, keys:[] in jwks.json
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 13. WELL-KNOWN / JWKS ===')
jwks_desc_para = [p.text for p in paras if 'jwks' in p.text.lower() and len(p.text) > 20]
for t in jwks_desc_para[:5]:
    print(f'  Para: {t[:140]}')

if re.search(r'keys.*\[\]|empty.*keys|HS256.*jwks|jwks.*HS256|shared.?secret.*jwks', full_text, re.IGNORECASE):
    good('JWKS empty keys for HS256', 'mentioned in doc')
else:
    note('JWKS empty keys', 'code returns keys:[] for HS256; check doc clarifies this')

# ─────────────────────────────────────────────────────────────────────────────
# 14. REGISTER FLOW — code: validate pw → check dup → save → welcome email → JWT → session
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 14. REGISTER FLOW ===')
register_patterns = [
    (r'welcome.*email|email.*welcome|ยินดีต้อนรับ.*อีเมล', 'welcome email on register'),
    (r'password.*(?:strength|complexity|ความแข็งแกร่ง|ตรวจสอบ)', 'password strength validation'),
    (r'duplicate.*(?:email|user)|email.*(?:duplicate|already)|ตรวจสอบ.*ซ้ำ', 'duplicate check'),
    (r'rollback|undo.*register|ลบ.*user.*token.*fail', 'rollback on token failure'),
]
for pat, label in register_patterns:
    if re.search(pat, full_text, re.IGNORECASE):
        good(f'Register {label}', 'mentioned')
    else:
        note(f'Register {label}', 'not explicitly in doc')

# ─────────────────────────────────────────────────────────────────────────────
# 15. CONSENT MODEL — check PDPA consent fields in doc vs code
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 15. PDPA CONSENT FIELDS ===')
# Code fields: essentialAccepted, analyticsAccepted, cookieConsentAccepted, policyVersion, consentIp
pdpa_field_patterns = [
    (r'essential|จำเป็น', 'essentialAccepted field'),
    (r'analytics|วิเคราะห์', 'analyticsAccepted field'),
    (r'cookie.*consent|consent.*cookie', 'cookieConsent field'),
    (r'policyVersion|policy.*version|version.*policy', 'policyVersion field'),
    (r'consentIp|consent.*ip|ip.*consent', 'consentIp field'),
]
for pat, label in pdpa_field_patterns:
    if re.search(pat, full_text, re.IGNORECASE):
        good(f'PDPA {label}', 'mentioned')
    else:
        note(f'PDPA {label}', 'not found in doc text')

# ─────────────────────────────────────────────────────────────────────────────
# REPORT
# ─────────────────────────────────────────────────────────────────────────────
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
