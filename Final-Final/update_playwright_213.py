"""
Update Playwright results: 211→213, 206/211 97.6%→213/213 100.0%, 0 skip, 0 flaky
"""
import sys, shutil
from docx import Document

sys.stdout.reconfigure(encoding='utf-8')

DOC_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx"
BAK_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx.bak_playwright213"

shutil.copy2(DOC_PATH, BAK_PATH)
print(f'Backup: {BAK_PATH}')

doc = Document(DOC_PATH)
log = []

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
    log.append(f'  SKIP {label}: "{old}" not found in cell')
    return False

def fix_para(para, old, new, label=''):
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
    log.append(f'  SKIP {label}: "{old}" not found in [{full[:80]}]')
    return False

# ── First: dump current state of all relevant paragraphs and tables ───────────
print('\n=== CURRENT STATE ===')

# Check paragraphs around 1000-1090
for i in [979, 980, 990, 1007, 1024, 1026, 1083, 1084, 1085, 1087, 1099]:
    if i < len(doc.paragraphs):
        t = doc.paragraphs[i].text.strip()
        if t:
            print(f'  para[{i}]: {t[:150]}')

# Check Table[9]
t9 = doc.tables[9]
print(f'\n  Table[9] rows: {len(t9.rows)}')
for ri, row in enumerate(t9.rows):
    cells = [c.text.strip()[:50] for c in row.cells]
    print(f'    T9 R{ri}: {cells}')

# Check Table[15]
t15 = doc.tables[15]
print(f'\n  Table[15] rows: {len(t15.rows)}')
for ri, row in enumerate(t15.rows):
    cells = [c.text.strip()[:50] for c in row.cells]
    if any('211' in c or '213' in c or 'skip' in c.lower() or 'oauth' in c.lower() or 'total' in c.lower() or 'TOTAL' in c for c in cells):
        print(f'    T15 R{ri}: {cells}')

print('\n=== APPLYING FIXES ===')

# ── Table[9] Row[3] — E2E Browser row ─────────────────────────────────────────
t9 = doc.tables[9]
r3 = t9.rows[3]
print(f'\n[T9 R3] cells: {[c.text.strip()[:60] for c in r3.cells]}')

# Col[2]: total count 211 → 213
fix_cell(r3.cells[2], '211', '213', 'T9R3C2-total')

# Col[3]: pass rate 206/211 (97.6%) → 213/213 (100.0%)
fix_cell(r3.cells[3], '206/211 (97.6%)', '213/213 (100.0%)', 'T9R3C3-rate')

# Col[4]: notes — remove skip/flaky info
fix_cell(r3.cells[4], '3 skip (OAuth state), 2 flaky (timing)', '0 skip, 0 flaky', 'T9R3C4-note-v1')
fix_cell(r3.cells[4], '3 skip (OAuth state), 2 flaky', '0 skip, 0 flaky', 'T9R3C4-note-v2')
fix_cell(r3.cells[4], 'skip (OAuth state)', '0 skip, 0 flaky', 'T9R3C4-note-v3')

# ── Table[15] — Playwright per-group table ────────────────────────────────────
t15 = doc.tables[15]

# Row[14] — OAuth Client Management: pass 2→5, skip 3→0
r14 = t15.rows[14]
print(f'\n[T15 R14] cells: {[c.text.strip()[:60] for c in r14.cells]}')
# Col[2] = pass count
fix_cell(r14.cells[2], '2', '5', 'T15R14C2-pass')
# Col[3] = skip count
fix_cell(r14.cells[3], '3', '0', 'T15R14C3-skip')

# Row[28] — TOTAL row
# Find the TOTAL row dynamically in case index shifts
total_row_idx = None
for ri, row in enumerate(t15.rows):
    if 'TOTAL' in row.cells[0].text or 'รวม' in row.cells[0].text:
        total_row_idx = ri

if total_row_idx is not None:
    rtotal = t15.rows[total_row_idx]
    print(f'\n[T15 TOTAL R{total_row_idx}] cells: {[c.text.strip()[:60] for c in rtotal.cells]}')
    fix_cell(rtotal.cells[1], '211', '213', 'T15TOTAL-C1-total')
    fix_cell(rtotal.cells[2], '206', '213', 'T15TOTAL-C2-pass')
    fix_cell(rtotal.cells[3], '3', '0',   'T15TOTAL-C3-skip')
    fix_cell(rtotal.cells[4], '~4.8 min', '~3.6 min', 'T15TOTAL-C4-time')
    fix_cell(rtotal.cells[4], '4.8 min',  '3.6 min',  'T15TOTAL-C4-time-v2')
else:
    print('  WARN: TOTAL row not found in T15 by text')

# ── Paragraph fixes ───────────────────────────────────────────────────────────
paras = doc.paragraphs

# Scan for paragraphs containing 211 or skip to find all relevant ones
print('\n[Para scan] Paragraphs with "211" or "skip":')
for i, p in enumerate(paras):
    t = p.text
    if ('211' in t or ('skip' in t.lower() and 'playwright' in t.lower()) or
        ('206' in t and 'playwright' in t.lower())):
        print(f'  [{i}]: {t[:160]}')

# Fix para[1007] — summary count
p1007 = paras[1007]
print(f'\n[para 1007]: {p1007.text[:180]}')
fix_para(p1007, '211 test cases', '213 test cases', 'para[1007]')
fix_para(p1007, '3 skip', '0 skip', 'para[1007]-skip')

# Fix para[1083] — detailed summary
p1083 = paras[1083]
print(f'\n[para 1083]: {p1083.text[:200]}')
fix_para(p1083, '211 test cases', '213 test cases', 'para[1083]')
fix_para(p1083, '206/211 (97.6%)', '213/213 (100.0%)', 'para[1083]-rate')
fix_para(p1083, '3 skip (OAuth state), 2 flaky (timing)', '0 skip', 'para[1083]-skip-v1')
fix_para(p1083, '3 skip (OAuth state)', '0 skip', 'para[1083]-skip-v2')
fix_para(p1083, '2 flaky (timing)', '', 'para[1083]-flaky')

# Also check para[1026] for 211 mentions
p1026 = paras[1026]
print(f'\n[para 1026]: {p1026.text[:200]}')
fix_para(p1026, '211', '213', 'para[1026]-211')
fix_para(p1026, '206', '213', 'para[1026]-206')

# Check para[1024] for known issues / skip mentions
p1024 = paras[1024]
print(f'\n[para 1024]: {p1024.text[:200]}')
fix_para(p1024, '3 skip', '0 skip', 'para[1024]-skip')

# Check para[1085]
if 1085 < len(paras):
    p1085 = paras[1085]
    print(f'\n[para 1085]: {p1085.text[:200]}')
    fix_para(p1085, '211', '213', 'para[1085]-211')
    fix_para(p1085, '206', '213', 'para[1085]-206')

# ── Verification ──────────────────────────────────────────────────────────────
print('\n=== VERIFICATION ===')

# Re-load to verify
doc2 = Document(DOC_PATH + '.tmp_verify') if False else doc

checks = [
    ('T9R3C2',  '213',          t9.rows[3].cells[2].text),
    ('T9R3C3',  '213/213',      t9.rows[3].cells[3].text),
    ('T9R3C4',  '0 skip',       t9.rows[3].cells[4].text),
    ('T15R14C2','5',             t15.rows[14].cells[2].text),
    ('T15R14C3','0',             t15.rows[14].cells[3].text),
]

if total_row_idx:
    rtotal = t15.rows[total_row_idx]
    checks += [
        ('T15TOTAL-C1', '213', rtotal.cells[1].text),
        ('T15TOTAL-C2', '213', rtotal.cells[2].text),
        ('T15TOTAL-C3', '0',   rtotal.cells[3].text),
    ]

all_pass = True
for loc, expected, actual in checks:
    ok = expected in actual
    status = 'PASS' if ok else 'FAIL'
    if not ok:
        all_pass = False
    print(f'  {status}: {loc} contains "{expected}" | actual: "{actual[:80]}"')

# ── Save ──────────────────────────────────────────────────────────────────────
doc.save(DOC_PATH)
print(f'\nSaved: {DOC_PATH}')

print('\n=== Change log ===')
for entry in log:
    print(entry)

print(f'\nResult: {"ALL PASS" if all_pass else "SOME FAILED — review above"}')
