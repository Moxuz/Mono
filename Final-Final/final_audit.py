"""
Final comprehensive audit of TAS8-final (1).docx
Checks: headings order, table captions order, figure captions order,
all table contents vs known correct values, PDPA sections, tech facts
"""
import sys
from docx import Document

sys.stdout.reconfigure(encoding='utf-8')
DOC_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx"
doc = Document(DOC_PATH)
paras = doc.paragraphs

issues = []
ok_list = []

def check(cond, label, detail=''):
    if cond:
        ok_list.append(f'  OK  {label}')
    else:
        issues.append(f'  FAIL {label}: {detail}')

# ─── helpers ──────────────────────────────────────────────────────────────────
def pt(i): return paras[i].text
def cell(ti, ri, ci): return doc.tables[ti].rows[ri].cells[ci].text.strip()

# ─────────────────────────────────────────────────────────────────────────────
# 1. TABLE CAPTIONS — correct numbering and physical order
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 1. TABLE CAPTIONS ===')
table_caps = [(i, p.text) for i, p in enumerate(paras) if 'ตารางที่' in p.text]
for i, t in table_caps:
    print(f'  [{i}] {t}')

# Check specific expected captions
check('ตารางที่ 3.1' in pt(374), 'para[374] = ตารางที่ 3.1 (Requirements)')
check('ตารางที่ 3.2' in pt(641), 'para[641] = ตารางที่ 3.2 (API Endpoints)')
check('44 endpoints'  in pt(641), 'para[641] = 44 endpoints (not 56)')
check('ตารางที่ 3.3' in pt(803), 'para[803] = ตารางที่ 3.3 (JWT)')
check('ตารางที่ 3.4' in pt(807), 'para[807] = ตารางที่ 3.4 (Rate Limiting)')
check('ตารางที่ 3.5' in pt(821), 'para[821] = ตารางที่ 3.5 (PDPA)')
check('ตารางที่ 4.0' in pt(914), 'para[914] = ตารางที่ 4.0 (Summary placeholder fixed)')
# Ensure 3.5 does NOT appear before 3.1 (ordering check)
idx_31 = next((i for i,t in table_caps if 'ตารางที่ 3.1' in t), 9999)
idx_32 = next((i for i,t in table_caps if 'ตารางที่ 3.2' in t), 9999)
check(idx_31 < idx_32, 'ตารางที่ 3.1 appears before 3.2 (physical order)', f'{idx_31} vs {idx_32}')
# No old placeholders
check(not any('3.5' in t and '3.1' not in t and i < 400 for i,t in table_caps if i < 400),
      'No ตารางที่ 3.5 appearing before paragraph 400')
check(not any('4.X' in t for _,t in table_caps), 'No ตารางที่ 4.X placeholder remains')

# ─────────────────────────────────────────────────────────────────────────────
# 2. FIGURE CAPTIONS — correct numbering and physical order
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 2. FIGURE CAPTIONS ===')
fig_caps = [(i, p.text) for i, p in enumerate(paras) if 'รูปที่' in p.text]
for i, t in fig_caps:
    print(f'  [{i}] {t}')

# Check sequential ordering of figure numbers in ch3 and ch4
fig_texts = [t for _,t in fig_caps]
ch3_figs = [t for t in fig_texts if 'รูปที่ 3.' in t]
ch4_figs = [t for t in fig_texts if 'รูปที่ 4.' in t]
for expected, actual_list, label in [
    (['3.1','3.2','3.3','3.4','3.5','3.6','3.7'], ch3_figs, 'Ch3 figures 3.1-3.7'),
    (['4.1','4.2','4.3','4.4','4.5','4.6','4.7'], ch4_figs, 'Ch4 figures 4.1-4.7'),
]:
    for num in expected:
        found = any(f'รูปที่ {num}' in t for t in actual_list)
        check(found, f'{label} — รูปที่ {num} exists')
# No x-placeholder
check(not any('3.x' in t.lower() or '4.x' in t.lower() for _,t in fig_caps), 'No รูปที่ X.x placeholder')

# ─────────────────────────────────────────────────────────────────────────────
# 3. TABLE[5] — JWT Token Configuration
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 3. TABLE[5] JWT Configuration ===')
t5 = doc.tables[5]
for ri, row in enumerate(t5.rows):
    print(f'  Row[{ri}]: {[c.text.strip()[:50] for c in row.cells]}')

check('HS256' in cell(5,1,1), 'T5 Row[1] Col[1] Algorithm Access = HS256',   cell(5,1,1))
check('HS256' in cell(5,1,2), 'T5 Row[1] Col[2] Algorithm Refresh = HS256',  cell(5,1,2))
check('Symmetric' in cell(5,1,3), 'T5 Row[1] Col[3] Remark = Symmetric',     cell(5,1,3))
check('RS256' not in cell(5,1,1), 'T5 Row[1]: No RS256 in Access col')
check('JWT_SECRET' in cell(5,7,1), 'T5 Row[7] Col[1] Key = JWT_SECRET',      cell(5,7,1))
check('JWT_SECRET' in cell(5,7,2), 'T5 Row[7] Col[2] Key = JWT_SECRET',      cell(5,7,2))
check('JWT_PRIVATE_KEY' not in cell(5,7,1), 'T5 Row[7]: No JWT_PRIVATE_KEY')
check('N/A' in cell(5,8,1), 'T5 Row[8] Col[1] Public Key = N/A',             cell(5,8,1))

# ─────────────────────────────────────────────────────────────────────────────
# 4. TABLE[6] — Token Expiry
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 4. TABLE[6] Token Expiry ===')
t6 = doc.tables[6]
for ri, row in enumerate(t6.rows):
    print(f'  Row[{ri}]: {[c.text.strip() for c in row.cells]}')

check('Access Token' in cell(6,2,0), 'T6 Row[2] = Access Token (not Refresh)', cell(6,2,0))
check('Access Token' in cell(6,3,0), 'T6 Row[3] = Access Token (not Refresh)', cell(6,3,0))
check('30' in cell(6,2,1), 'T6 Row[2] expiry = 30 days',   cell(6,2,1))
check('1'  in cell(6,3,1), 'T6 Row[3] expiry = 1 hour',    cell(6,3,1))

# ─────────────────────────────────────────────────────────────────────────────
# 5. TABLE[3] — Rate Limiting summary
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 5. TABLE[3] Rate Limiting Summary ===')
t3 = doc.tables[3]
for ri, row in enumerate(t3.rows):
    print(f'  Row[{ri}]: {[c.text.strip() for c in row.cells]}')

check('5' == cell(3,1,1), 'T3 Row[1] Login max = 5',          cell(3,1,1))
check('5' == cell(3,2,1), 'T3 Row[2] Register max = 5',       cell(3,2,1))
check('10'== cell(3,3,1), 'T3 Row[3] OAuth Token max = 10',   cell(3,3,1))
check('5' == cell(3,4,1), 'T3 Row[4] Forgot-pw max = 5',      cell(3,4,1))
check('30'== cell(3,5,1), 'T3 Row[5] Authorize max = 30',     cell(3,5,1))
check('20'== cell(3,6,1), 'T3 Row[6] Introspect max = 20',    cell(3,6,1))
check('20'== cell(3,7,1), 'T3 Row[7] Revoke max = 20',        cell(3,7,1))
check('100'==cell(3,8,1), 'T3 Row[8] General max = 100',      cell(3,8,1))

# ─────────────────────────────────────────────────────────────────────────────
# 6. TABLE[7] — Detailed rate limiting
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 6. TABLE[7] Detailed Rate Limiting ===')
t7 = doc.tables[7]
for ri, row in enumerate(t7.rows):
    print(f'  Row[{ri}]: {[c.text.strip()[:40] for c in row.cells]}')

check('5' == cell(7,2,2),       'T7 Row[2] Register max = 5',        cell(7,2,2))
check('1 min' == cell(7,9,1),   'T7 Row[9] Userinfo window = 1 min', cell(7,9,1))
check('60' == cell(7,9,2),      'T7 Row[9] Userinfo max = 60',       cell(7,9,2))

# ─────────────────────────────────────────────────────────────────────────────
# 7. TABLE[8] — PDPA Compliance
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 7. TABLE[8] PDPA Compliance ===')
t8 = doc.tables[8]
for ri, row in enumerate(t8.rows):
    print(f'  Row[{ri}]: {[c.text.strip()[:55] for c in row.cells]}')

pdpa_sections = {'19':'Section 19','27':'Section 27','28':'Section 28',
                 '33':'Section 33','37':'Section 37','40':'Section 40'}
for sec, label in pdpa_sections.items():
    found = any(sec in row.cells[0].text for row in t8.rows)
    check(found, f'PDPA {label} present in table')
check('cost-10' in cell(8,6,2), 'T8 Row[6] bcrypt = cost-10 (not cost-12)', cell(8,6,2))
check('cost-12' not in cell(8,6,2), 'T8 Row[6] No bcrypt cost-12')

# ─────────────────────────────────────────────────────────────────────────────
# 8. TABLE[9] — Test Summary (latest results)
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 8. TABLE[9] Test Results Summary ===')
t9 = doc.tables[9]
for ri, row in enumerate(t9.rows):
    print(f'  Row[{ri}]: {[c.text.strip()[:55] for c in row.cells]}')

check('108'          in cell(9,1,2), 'T9 Jest test cases = 108',        cell(9,1,2))
check('108/108'      in cell(9,1,3), 'T9 Jest pass = 108/108',          cell(9,1,3))
check('69 assertions'in cell(9,2,2), 'T9 Newman = 69 assertions',       cell(9,2,2))
check('69/69'        in cell(9,2,3), 'T9 Newman pass = 69/69',          cell(9,2,3))
check('100.0%'       in cell(9,2,3), 'T9 Newman = 100.0%',              cell(9,2,3))
check('211'          in cell(9,3,2), 'T9 Playwright = 211',             cell(9,3,2))
check('206/211'      in cell(9,3,3), 'T9 Playwright pass = 206/211',    cell(9,3,3))
check('59 passive'   in cell(9,5,2), 'T9 ZAP = 59 passive checks',      cell(9,5,2))
check('59 PASS'      in cell(9,5,3), 'T9 ZAP = 59 PASS',               cell(9,5,3))

# ─────────────────────────────────────────────────────────────────────────────
# 9. TABLE[13] — ZAP Risk Levels
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 9. TABLE[13] ZAP Risk Levels ===')
t13 = doc.tables[13]
for ri, row in enumerate(t13.rows):
    print(f'  Row[{ri}]: {[c.text.strip()[:55] for c in row.cells]}')

check('5'  == cell(13,1,1), 'T13 Medium = 5',  cell(13,1,1))
check('1'  == cell(13,2,1), 'T13 Low = 1',     cell(13,2,1))
check('6'  == cell(13,3,1), 'T13 Info = 6',    cell(13,3,1))
check('59' == cell(13,4,1), 'T13 PASS = 59',   cell(13,4,1))

# ─────────────────────────────────────────────────────────────────────────────
# 10. TABLE[14] — Newman detail
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 10. TABLE[14] Newman Detail ===')
t14 = doc.tables[14]
for ri, row in enumerate(t14.rows):
    print(f'  Row[{ri}]: {[c.text.strip() for c in row.cells]}')

check('21' == cell(14,2,2), 'T14 Auth assertions = 21', cell(14,2,2))
check('0'  == cell(14,2,4), 'T14 Auth fail = 0',        cell(14,2,4))
check('69' == cell(14,8,2), 'T14 TOTAL assertions = 69',cell(14,8,2))
check('0'  == cell(14,8,4), 'T14 TOTAL fail = 0',       cell(14,8,4))

# ─────────────────────────────────────────────────────────────────────────────
# 11. TABLE[15] — Playwright detail
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 11. TABLE[15] Playwright Detail ===')
t15 = doc.tables[15]
for ri, row in enumerate(t15.rows):
    print(f'  Row[{ri}]: {[c.text.strip()[:40] for c in row.cells]}')

check('211' in cell(15,28,1), 'T15 TOTAL tests = 211',    cell(15,28,1))
check('206' in cell(15,28,2), 'T15 TOTAL pass = 206',     cell(15,28,2))
check('3'   == cell(15,28,3), 'T15 TOTAL skip = 3',       cell(15,28,3))
check('4.8' in cell(15,28,4), 'T15 TOTAL time ~4.8 min',  cell(15,28,4))

# ─────────────────────────────────────────────────────────────────────────────
# 12. SCAN paragraphs for stale/wrong values
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 12. Stale value scan (paragraphs) ===')
stale_patterns = [
    ('RS256', 'RS256 algorithm mention'),
    ('JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY env var'),
    ('bcrypt cost-12', 'bcrypt cost-12'),
    ('69/70', 'Newman 69/70'),
    ('98.6%', 'Newman 98.6%'),
    ('182/186', 'Playwright 182/186'),
    ('97.8%', 'Playwright 97.8%'),
    ('55 PASS', 'ZAP 55 PASS'),
    ('ตารางที่ 4.X', 'Table 4.X placeholder'),
]
for pattern, desc in stale_patterns:
    hits = [(i, p.text) for i, p in enumerate(paras) if pattern in p.text]
    if hits:
        for i, t in hits:
            issues.append(f'  FAIL Stale "{pattern}" at para[{i}]: {t[:100]}')
    else:
        ok_list.append(f'  OK  No stale "{pattern}" found')

# ─────────────────────────────────────────────────────────────────────────────
# FINAL REPORT
# ─────────────────────────────────────────────────────────────────────────────
print('\n' + '='*70)
print(f'PASSED: {len(ok_list)}')
print(f'FAILED: {len(issues)}')
print('='*70)

if issues:
    print('\n--- ISSUES FOUND ---')
    for x in issues:
        print(x)
else:
    print('\nALL CHECKS PASSED')

print('\n--- OK CHECKS ---')
for x in ok_list:
    print(x)
