"""
update_playwright3.py — appends pages-full describes 28-30 to the §4.2.6 table
and updates the total count in TAS6-final.docx
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
from docx.oxml import OxmlElement

doc = Document('TAS6-final.docx')

def insert_after(ref_para, text, bold=False, italic=False):
    new_p = OxmlElement('w:p')
    ref_para._p.addnext(new_p)
    paras = doc.paragraphs
    ref_idx = next(i for i, p in enumerate(paras) if p._p is ref_para._p)
    new_para = paras[ref_idx + 1]
    if text:
        run = new_para.add_run(text)
        run.bold = bold
        run.italic = italic
    return new_para

# Find the TOTAL row in the playwright table to insert after
anchor = None
for para in doc.paragraphs:
    if 'TOTAL' in para.text and '141' in para.text and '144' in para.text:
        anchor = para
        print(f"Found TOTAL row: {para.text[:80]}")
        break

if not anchor:
    print("Trying alternate search...")
    for para in doc.paragraphs:
        if 'TOTAL' in para.text and 'client.spec.ts' in para.text:
            anchor = para
            print(f"Found by client.spec: {para.text[:80]}")
            break

if not anchor:
    print("ERROR: TOTAL row not found"); exit(1)

# Update the TOTAL row to reflect new totals (182 pass + 4 skip = 186 tests)
for run in anchor.runs:
    run.text = ''
anchor.add_run('TOTAL | 186 | 182 | 4 | ~1.5 min')

# Insert new rows for describes 28-30
cur = anchor
new_rows = [
    ('28 — Public Pages (no auth)',            '10',  '10', '0',  'pages-full.spec.ts'),
    ('29 — User Pages (localStorage token)',   '20',  '20', '0',  'pages-full.spec.ts'),
    ('30 — Admin Pages (admin token)',         '12',  '12', '0',  'pages-full.spec.ts'),
]
# Insert before TOTAL by inserting after each previous row
# Actually insert after anchor (TOTAL) then they appear after
for row in reversed(new_rows):
    p = OxmlElement('w:p')
    anchor._p.addnext(p)
    paras = doc.paragraphs
    idx = next(i for i, para in enumerate(paras) if para._p is anchor._p)
    new_para = paras[idx + 1]
    new_para.add_run(' | '.join(row))

# Now find the summary line and update it
for para in doc.paragraphs:
    if '141 pass' in para.text or ('141' in para.text and '144' in para.text and 'pass' in para.text):
        for run in para.runs:
            run.text = ''
        para.add_run(
            'เครื่องมือที่ใช้: Playwright v1.x, Browser: Chromium (headless), '
            'Test files: 9 spec files + helpers.ts, '
            'จำนวน test cases: 186 รวม (182 pass, 4 skip), '
            'เวลารวม: ~1.5 นาที (parallel execution ด้วย 8 workers)',
            )
        para.runs[-1].italic = True
        print(f"Updated summary line")
        break

doc.save('TAS6-final.docx')
print("Saved TAS6-final.docx — §4.2.6 updated with describes 28-30 (page rendering suite)")
