"""
Update test results in TAS8-final (1).docx
"""
import sys
import re
from docx import Document
from docx.oxml.ns import qn

sys.stdout.reconfigure(encoding='utf-8')

DOC_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx"
doc = Document(DOC_PATH)

def set_cell_text(cell, new_text):
    """Replace cell text while preserving paragraph structure."""
    para = cell.paragraphs[0]
    if para.runs:
        run0 = para.runs[0]
        fmt_bold   = run0.bold
        fmt_italic = run0.italic
        fmt_size   = run0.font.size
        fmt_name   = run0.font.name
        for run in para.runs:
            run.text = ''
        run0.text   = new_text
        run0.bold   = fmt_bold
        run0.italic = fmt_italic
        if fmt_size: run0.font.size = fmt_size
        if fmt_name: run0.font.name = fmt_name
    else:
        para.add_run(new_text)

def replace_in_para(para, old, new):
    """Replace text across all runs in a paragraph."""
    full = para.text
    if old not in full:
        return False
    # Simple: rebuild first run with replaced text, clear others
    new_full = full.replace(old, new)
    if para.runs:
        run0 = para.runs[0]
        fmt_bold   = run0.bold
        fmt_italic = run0.italic
        fmt_size   = run0.font.size
        fmt_name   = run0.font.name
        for run in para.runs:
            run.text = ''
        run0.text = new_full
        run0.bold   = fmt_bold
        run0.italic = fmt_italic
        if fmt_size: run0.font.size = fmt_size
        if fmt_name: run0.font.name = fmt_name
    else:
        para.add_run(new_full)
    return True

changes = []

# ─────────────────────────────────────────────────────────────────────────────
# TABLE[9] — Summary test results table
# ─────────────────────────────────────────────────────────────────────────────
t9 = doc.tables[9]

# Row[1] Jest: 104→108, pass, note
set_cell_text(t9.rows[1].cells[2], '108')
set_cell_text(t9.rows[1].cells[3], '108/108 (100%)')
set_cell_text(t9.rows[1].cells[4], '27 กลุ่มทดสอบ; 6 ไฟล์ทดสอบ')
changes.append('Table[9] Row[1] Jest: 104→108')

# Row[2] Newman: assertions, pass rate, note
set_cell_text(t9.rows[2].cells[2], '31 requests / 69 assertions')
set_cell_text(t9.rows[2].cells[3], '69/69 (100.0%)')
set_cell_text(t9.rows[2].cells[4], 'ผ่านทุก assertion (logout timeout แก้ไขแล้ว)')
changes.append('Table[9] Row[2] Newman: 70→69 assertions, 98.6%→100.0%, remove bug note')

# Row[3] Playwright: 186→211, pass rate, note
set_cell_text(t9.rows[3].cells[1], 'Playwright v1.58.2 (Chromium)')
set_cell_text(t9.rows[3].cells[2], '211')
set_cell_text(t9.rows[3].cells[3], '206/211 (97.6%)')
set_cell_text(t9.rows[3].cells[4], '38 กลุ่ม; 9 spec files; 3 skip (OAuth state), 2 flaky (timing)')
changes.append('Table[9] Row[3] Playwright: 186→211, 182→206, note updated')

# Row[5] ZAP: checks count, PASS count
set_cell_text(t9.rows[5].cells[2], '42 URLs / 59 passive checks')
set_cell_text(t9.rows[5].cells[3], '0 FAIL / 59 PASS')
set_cell_text(t9.rows[5].cells[4], '12 WARN (CSP, SRI, Private IP)')
changes.append('Table[9] Row[5] ZAP: 55→59 checks, note updated')

# ─────────────────────────────────────────────────────────────────────────────
# TABLE[10] — Jest detailed results (total row only)
# ─────────────────────────────────────────────────────────────────────────────
t10 = doc.tables[10]
# Row[28] total
set_cell_text(t10.rows[28].cells[3], '108')
set_cell_text(t10.rows[28].cells[4], '108/108 ผ่าน')
changes.append('Table[10] Row[28] Jest total: 104→108')

# ─────────────────────────────────────────────────────────────────────────────
# TABLE[13] — ZAP risk levels
# ─────────────────────────────────────────────────────────────────────────────
t13 = doc.tables[13]
# Row[1] Medium: 4→5
set_cell_text(t13.rows[1].cells[1], '5')
set_cell_text(t13.rows[1].cells[2], 'CSP wildcard, unsafe-eval, unsafe-inline (x5), SRI missing (x5)')
changes.append('Table[13] Row[1] Medium: 4→5')

# Row[2] Low: 4→1
set_cell_text(t13.rows[2].cells[1], '1')
set_cell_text(t13.rows[2].cells[2], 'Private IP Disclosure (172.x ใน source code)')
changes.append('Table[13] Row[2] Low: 4→1')

# Row[3] Info: 9→6
set_cell_text(t13.rows[3].cells[1], '6')
set_cell_text(t13.rows[3].cells[2], 'Auth request identified, information in URL, suspicious comments')
changes.append('Table[13] Row[3] Info: 9→6')

# Row[4] PASS: 55→59
set_cell_text(t13.rows[4].cells[1], '59')
set_cell_text(t13.rows[4].cells[2], 'ผ่านทุก check ด้านความปลอดภัยหลัก (เพิ่มขึ้นจากการแก้ไข headers)')
changes.append('Table[13] Row[4] PASS: 55→59')

# ─────────────────────────────────────────────────────────────────────────────
# TABLE[15] — Playwright detailed results (TOTAL row)
# ─────────────────────────────────────────────────────────────────────────────
t15 = doc.tables[15]
# Row[28] TOTAL
set_cell_text(t15.rows[28].cells[1], '211')
set_cell_text(t15.rows[28].cells[2], '206')
set_cell_text(t15.rows[28].cells[3], '3')
set_cell_text(t15.rows[28].cells[4], '~4.8 min (2 flaky)')
changes.append('Table[15] Row[28] Playwright TOTAL: 186→211, 183→206, ~1.5min→~4.8min')

# ─────────────────────────────────────────────────────────────────────────────
# PARAGRAPHS
# ─────────────────────────────────────────────────────────────────────────────
paras = doc.paragraphs

# [979] ZAP summary — update total alerts 17→12, Low
if replace_in_para(paras[979], '17', '12'):
    changes.append('[979] ZAP summary: 17 alerts→12 alerts (if present)')
# Check and update Low risk count
replace_in_para(paras[979], 'Low:5', 'Low:1')
replace_in_para(paras[979], 'Low: 5', 'Low: 1')

# [980] ZAP tool note — update date
if replace_in_para(paras[980], '29 ม', '25 เมษายน 2569'):
    changes.append('[980] ZAP date: updated to 25 เมษายน 2569')
else:
    # Try other patterns
    for old_date in ['29 มี', '29 มีนาคม', '28 เมษายน', '27 เมษายน', '26 เมษายน']:
        if replace_in_para(paras[980], old_date, '25 เมษายน 2569'):
            changes.append(f'[980] ZAP date: {old_date}→25 เมษายน 2569')
            break

# [990] Newman known issue — remove logout 504 paragraph
p990 = paras[990]
if '504' in p990.text and 'logout' in p990.text:
    if p990.runs:
        for run in p990.runs:
            run.text = ''
        p990.runs[0].text = '* หมายเหตุ: Newman v6.2.2 ผ่านทุก 69 assertions (100.0%) — logout 504 timeout ได้รับการแก้ไขแล้ว'
    changes.append('[990] Newman: removed logout 504 known bug note, replaced with resolved note')

# [1007] Playwright: 27 กลุ่ม → 38 กลุ่ม, 141 → 211
if replace_in_para(paras[1007], '27 กล', '38 กล'):
    changes.append('[1007] Playwright: 27 groups→38 groups')
if replace_in_para(paras[1007], '141 test', '211 test'):
    changes.append('[1007] Playwright: 141 test→211 test')
# Also fix "186" if it appears
replace_in_para(paras[1007], '186', '211')

# [1026] Playwright tool note — update run count and time
p1026 = paras[1026]
if '186' in p1026.text or '182' in p1026.text:
    old_text = p1026.text
    new_text = old_text
    new_text = new_text.replace('186 รัน', '211 รัน')
    new_text = new_text.replace('186 รวม', '211 รวม')
    new_text = new_text.replace('182 pass', '206 pass')
    new_text = new_text.replace('4 skip', '3 skip')
    new_text = new_text.replace('~1.5 นาที', '~4.8 นาที')
    new_text = new_text.replace('~1.5 min', '~4.8 นาที')
    new_text = new_text.replace('8 workers', '4 workers')
    if new_text != old_text:
        if p1026.runs:
            for run in p1026.runs:
                run.text = ''
            p1026.runs[0].text = new_text
        changes.append('[1026] Playwright tool note: updated counts and time')

# ─────────────────────────────────────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────────────────────────────────────
doc.save(DOC_PATH)

print("=== Changes applied ===")
for c in changes:
    print(f"  OK: {c}")
print(f"\nSaved: {DOC_PATH}")
print(f"Total changes: {len(changes)}")
