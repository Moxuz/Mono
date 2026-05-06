"""
Comprehensive fact-check fix for TAS8-final (1).docx
Verified against actual source code — 6 categories of fixes
"""
import sys, shutil
from docx import Document

sys.stdout.reconfigure(encoding='utf-8')

DOC_PATH  = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx"
BAK_PATH  = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx.bak2"

# ── Helpers ───────────────────────────────────────────────────────────────────
def fix_cell(cell, old, new, label=''):
    for para in cell.paragraphs:
        full = ''.join(r.text for r in para.runs)
        if old in full:
            if para.runs:
                para.runs[0].text = full.replace(old, new, 1)
                for r in para.runs[1:]:
                    r.text = ''
            else:
                para.add_run(full.replace(old, new, 1))
            log.append(f'  OK {label}: "{old}" → "{new}"')
            return True
    log.append(f'  SKIP {label}: "{old}" not found')
    return False

def fix_para(para, old, new, label=''):
    full = ''.join(r.text for r in para.runs)
    if old in full:
        if para.runs:
            para.runs[0].text = full.replace(old, new, 1)
            for r in para.runs[1:]:
                r.text = ''
        log.append(f'  OK {label}: "{old}" → "{new}"')
        return True
    log.append(f'  SKIP {label}: "{old}" not found in [{full[:60]}]')
    return False

# ── Load & backup ─────────────────────────────────────────────────────────────
shutil.copy2(DOC_PATH, BAK_PATH)
print(f'Backup: {BAK_PATH}')

doc = Document(DOC_PATH)
log = []

# ═════════════════════════════════════════════════════════════════════════════
# SECTION A — Table number cascade
# ═════════════════════════════════════════════════════════════════════════════
print('\n[A] Table numbering cascade')
fix_para(doc.paragraphs[374], 'ตารางที่ 3.5', 'ตารางที่ 3.1', 'para[374]')
# para[641]: renumber AND fix endpoint count (two replacements)
fix_para(doc.paragraphs[641], 'ตารางที่ 3.1', 'ตารางที่ 3.2', 'para[641]-num')
fix_para(doc.paragraphs[641], '56 endpoints', '44 endpoints',  'para[641]-ep')
fix_para(doc.paragraphs[803], 'ตารางที่ 3.2', 'ตารางที่ 3.3', 'para[803]')
fix_para(doc.paragraphs[807], 'ตารางที่ 3.3', 'ตารางที่ 3.4', 'para[807]')
fix_para(doc.paragraphs[821], 'ตารางที่ 3.4', 'ตารางที่ 3.5', 'para[821]')
fix_para(doc.paragraphs[914], 'ตารางที่ 4.X', 'ตารางที่ 4.0', 'para[914]')

# ═════════════════════════════════════════════════════════════════════════════
# SECTION B — JWT Algorithm RS256 → HS256
# ═════════════════════════════════════════════════════════════════════════════
print('\n[B] JWT algorithm fixes')
t5 = doc.tables[5]

# Row[1]: Algorithm row — 3 cells to fix
fix_cell(t5.rows[1].cells[1], 'RS256 (RSA 2048-bit)', 'HS256 (HMAC-SHA256)',           'T5R1C1')
fix_cell(t5.rows[1].cells[2], 'RS256 (RSA 2048-bit)', 'HS256 (HMAC-SHA256)',           'T5R1C2')
fix_cell(t5.rows[1].cells[3], 'Asymmetric - ตรวจสอบได้ด้วย public key',
                               'Symmetric - HMAC ด้วย JWT_SECRET (shared secret)',     'T5R1C3')

# Row[7]: Private Key Source
fix_cell(t5.rows[7].cells[1], 'process.env.JWT_PRIVATE_KEY', 'process.env.JWT_SECRET', 'T5R7C1')
fix_cell(t5.rows[7].cells[2], 'process.env.JWT_PRIVATE_KEY', 'process.env.JWT_SECRET', 'T5R7C2')

# Row[8]: Public Key Expose
fix_cell(t5.rows[8].cells[1], 'JWKS endpoint', 'N/A (HS256 ใช้ shared secret)',        'T5R8C1')
fix_cell(t5.rows[8].cells[2], 'JWKS endpoint', 'N/A (HS256 ใช้ shared secret)',        'T5R8C2')
fix_cell(t5.rows[8].cells[3], '/.well-known/jwks.json',
                               '/.well-known/jwks.json (คืนค่า keys: [] สำหรับ HS256)', 'T5R8C3')

# para[382] — requirements table row mentioning RS256
fix_para(doc.paragraphs[382], 'RS256', 'HS256', 'para[382]')

# ═════════════════════════════════════════════════════════════════════════════
# SECTION C — Rate Limiting wrong values
# ═════════════════════════════════════════════════════════════════════════════
print('\n[C] Rate limit fixes')
t3 = doc.tables[3]
t7 = doc.tables[7]

# TABLE[3] Row[2] — Register: 3 → 5
fix_cell(t3.rows[2].cells[1], '3', '5', 'T3R2C1-register-max')

# TABLE[7] Row[2] — Register: 3 → 5
fix_cell(t7.rows[2].cells[2], '3', '5', 'T7R2C2-register-max')

# TABLE[7] Row[9] — Userinfo: 15 min → 1 min, 100 → 60
fix_cell(t7.rows[9].cells[1], '15 min', '1 min', 'T7R9C1-userinfo-window')
fix_cell(t7.rows[9].cells[2], '100',    '60',    'T7R9C2-userinfo-max')

# ═════════════════════════════════════════════════════════════════════════════
# SECTION D — bcrypt cost: cost-12 → cost-10
# ═════════════════════════════════════════════════════════════════════════════
print('\n[D] bcrypt cost fix')
t8 = doc.tables[8]
fix_cell(t8.rows[6].cells[2], 'bcrypt cost-12', 'bcrypt cost-10', 'T8R6C2-bcrypt')

# ═════════════════════════════════════════════════════════════════════════════
# SECTION E — Token type labels: Refresh Token → Access Token in TABLE[6]
# ═════════════════════════════════════════════════════════════════════════════
print('\n[E] Token type label fixes')
t6 = doc.tables[6]
# Row[2]: 30-day remember-me token — is Access Token, not Refresh Token
fix_cell(t6.rows[2].cells[0], 'Refresh Token', 'Access Token', 'T6R2C0')
# Row[3]: 1-hour session token — is Access Token, not Refresh Token
fix_cell(t6.rows[3].cells[0], 'Refresh Token', 'Access Token', 'T6R3C0')

# ═════════════════════════════════════════════════════════════════════════════
# SECTION F — Verification pass
# ═════════════════════════════════════════════════════════════════════════════
print('\n[F] Verification')
checks = [
    ('para[374]',   'ตารางที่ 3.1',   doc.paragraphs[374].text),
    ('para[641]',   'ตารางที่ 3.2',   doc.paragraphs[641].text),
    ('para[641]',   '44 endpoints',  doc.paragraphs[641].text),
    ('para[803]',   'ตารางที่ 3.3',   doc.paragraphs[803].text),
    ('para[807]',   'ตารางที่ 3.4',   doc.paragraphs[807].text),
    ('para[821]',   'ตารางที่ 3.5',   doc.paragraphs[821].text),
    ('para[914]',   'ตารางที่ 4.0',   doc.paragraphs[914].text),
    ('T5R1C1',      'HS256',         t5.rows[1].cells[1].text),
    ('T5R1C2',      'HS256',         t5.rows[1].cells[2].text),
    ('T5R1C3',      'Symmetric',     t5.rows[1].cells[3].text),
    ('T5R7C1',      'JWT_SECRET',    t5.rows[7].cells[1].text),
    ('T5R7C2',      'JWT_SECRET',    t5.rows[7].cells[2].text),
    ('T5R8C1',      'N/A',           t5.rows[8].cells[1].text),
    ('T3R2C1',      '5',             t3.rows[2].cells[1].text.strip()),
    ('T7R2C2',      '5',             t7.rows[2].cells[2].text.strip()),
    ('T7R9C1',      '1 min',         t7.rows[9].cells[1].text.strip()),
    ('T7R9C2',      '60',            t7.rows[9].cells[2].text.strip()),
    ('T8R6C2',      'cost-10',       t8.rows[6].cells[2].text),
    ('T6R2C0',      'Access Token',  t6.rows[2].cells[0].text.strip()),
    ('T6R3C0',      'Access Token',  t6.rows[3].cells[0].text.strip()),
]

all_pass = True
for loc, expected, actual in checks:
    ok = expected in actual
    status = 'PASS' if ok else 'FAIL'
    if not ok: all_pass = False
    print(f'  {status}: {loc} contains "{expected}"  | actual: "{actual[:70]}"')

# ═════════════════════════════════════════════════════════════════════════════
# Save
# ═════════════════════════════════════════════════════════════════════════════
doc.save(DOC_PATH)
print(f'\nSaved: {DOC_PATH}')

print('\n=== Change log ===')
for entry in log:
    print(entry)

overall = 'ALL PASS' if all_pass else 'SOME FAILED — review above'
print(f'\nResult: {overall}')
