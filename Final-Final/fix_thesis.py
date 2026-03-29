"""
fix_thesis.py — fixes numbering conflicts and adds missing tables to TAS6-final.docx
Run from: Final-Final/

Changes:
  1. Fix duplicate section numbers (3.4/3.5 shift → 3.5/3.6/3.7/3.8/3.9)
  2. Fix duplicate table numbers (4.x placeholder, UAT 4.1→4.7, Satisfaction 4.2→4.8,
     and cascade existing 4.1-4.5 → 4.2-4.6 to make room for new Jest table)
  3. Add System Requirements Table (ตารางที่ 3.5) after §3.1.5, before §3.2
  4. Add Jest Unit/Integration Test Table (ตารางที่ 4.1) before §4.2.1
  5. Add Test Summary Table (ตารางที่ 4.X) after §4.2 heading
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
from docx.shared import Pt, Inches
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
import openpyxl

doc = Document('TAS6-final.docx')

# ── helpers ───────────────────────────────────────────────────────────────────
def insert_after(ref_para, text='', bold=False, italic=False, center=False, size=12):
    new_p = OxmlElement('w:p')
    ref_para._p.addnext(new_p)
    paras = doc.paragraphs
    idx = next(i for i, p in enumerate(paras) if p._p is new_p)
    new_para = paras[idx]
    if text:
        run = new_para.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.size = Pt(size)
    if center:
        new_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    return new_para

def insert_before(anchor_para, text='', bold=False, italic=False, center=False, size=12):
    """Insert new paragraph immediately before anchor_para."""
    new_p = OxmlElement('w:p')
    anchor_para._p.addprevious(new_p)
    paras = doc.paragraphs
    idx = next(i for i, p in enumerate(paras) if p._p is new_p)
    new_para = paras[idx]
    if text:
        run = new_para.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.size = Pt(size)
    if center:
        new_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    return new_para

def fix_para_text(para, old, new):
    """Replace text in a paragraph, preserving first run's formatting."""
    if para.text.strip() == old:
        for run in para.runs:
            run.text = ''
        if para.runs:
            para.runs[0].text = new
        else:
            para.add_run(new)
        return True
    return False

# ════════════════════════════════════════════════════════════════════════════════
# STEP 1 — Fix duplicate section numbers
# ════════════════════════════════════════════════════════════════════════════════
print("Step 1: Fixing duplicate section numbers...")

SECTION_RENAMES = {
    '3.4 Sequence Diagrams':                              '3.5 Sequence Diagrams',
    '3.5 Data Flow Diagrams (DFD)':                       '3.6 Data Flow Diagrams (DFD)',
    '3.5 API Endpoints':                                  '3.7 API Endpoints',
    '3.6 คุณสมบัติความปลอดภัย':                        '3.8 คุณสมบัติความปลอดภัย',
    '3.6.1 Rate Limiting':                                '3.8.1 Rate Limiting',
    '3.6.2 Account Lockout':                              '3.8.2 Account Lockout',
    '3.6.3 CSRF Protection':                              '3.8.3 CSRF Protection',
    '3.6.4 Password Hashing':                             '3.8.4 Password Hashing',
    '3.6.5 Refresh Token Rotation':                       '3.8.5 Refresh Token Rotation',
    '3.6.6 Token Blacklisting':                           '3.8.6 Token Blacklisting',
    '3.6.7 Security Headers':                             '3.8.7 Security Headers',
    '3.6.8 Email Verification //':                        '3.8.8 Email Verification',
    '3.6.9 Token Blacklist Middleware Check':              '3.8.9 Token Blacklist Middleware Check',
    '3.6.10 Emergency Lockdown':                          '3.8.10 Emergency Lockdown',
    '3.6.11 PDPA Right to Erasure':                       '3.8.11 PDPA Right to Erasure',
    '3.6.12 PDPA Data Export':                            '3.8.12 PDPA Data Export',
    '3.6.13 Input Validation & Sanitization //':          '3.8.13 Input Validation & Sanitization',
    '3.6.14 WebSocket JWT Authentication':                '3.8.14 WebSocket JWT Authentication',
    '3.6.15 Body Size Limit':                             '3.8.15 Body Size Limit',
    '3.6.16 Inactive Account Check':                      '3.8.16 Inactive Account Check',
    '3.6.17 OAuth Token Introspect Client Authentication':'3.8.17 OAuth Token Introspect Client Authentication',
    '3.7 การกำหนดค่าระบบ (System Configuration)':       '3.9 การกำหนดค่าระบบ (System Configuration)',
}

sec_fixed = 0
for para in doc.paragraphs:
    txt = para.text.strip()
    if txt in SECTION_RENAMES:
        for run in para.runs:
            run.text = ''
        if para.runs:
            para.runs[0].text = SECTION_RENAMES[txt]
        else:
            para.add_run(SECTION_RENAMES[txt])
        print(f'  Section: {repr(txt[:50])} → {repr(SECTION_RENAMES[txt][:50])}')
        sec_fixed += 1

print(f'  Fixed {sec_fixed} section headings')

# ════════════════════════════════════════════════════════════════════════════════
# STEP 2 — Fix duplicate table numbers
# Must do in reverse document order (or use a two-pass) to avoid conflicts
# Existing: 4.1 (k6 P1), 4.2 (k6 P2), 4.3 (ZAP), 4.4 (Postman), 4.5 (E2E)
# Target:   4.2 (k6 P1), 4.3 (k6 P2), 4.4 (ZAP), 4.5 (Postman), 4.6 (E2E)
# Also:     4.x → 4.2 (placeholder), UAT 4.1 → 4.7, Satisfaction 4.2 → 4.8
# ════════════════════════════════════════════════════════════════════════════════
print("\nStep 2: Fixing duplicate table numbers...")

# Use exact paragraph text matching (safe to do in any order since no two old
# values equal a new value of another entry in this set)
TABLE_RENAMES = {
    'ตารางที่ 4.x ผลการทดสอบประสิทธิภาพ (Performance Test Results)':
        'ตารางที่ 4.2 ผลการทดสอบประสิทธิภาพ (Performance Test Results)',
    'ตารางที่ 4.1 ผลการทดสอบประสิทธิภาพ Phase 1 — Single Instance (k6 Load Test Results)':
        'ตารางที่ 4.2 ผลการทดสอบประสิทธิภาพ Phase 1 — Single Instance (k6 Load Test Results)',
    'ตารางที่ 4.2 ผลการทดสอบประสิทธิภาพ Phase 2 — Nginx Load Balancer (k6 Load Test Results)':
        'ตารางที่ 4.3 ผลการทดสอบประสิทธิภาพ Phase 2 — Nginx Load Balancer (k6 Load Test Results)',
    'ตารางที่ 4.3 ผลการทดสอบความปลอดภัย OWASP ZAP Baseline Scan':
        'ตารางที่ 4.4 ผลการทดสอบความปลอดภัย OWASP ZAP Baseline Scan',
    'ตารางที่ 4.4 ผลการทดสอบ API ด้วย Postman/Newman (Functional Test Results)':
        'ตารางที่ 4.5 ผลการทดสอบ API ด้วย Postman/Newman (Functional Test Results)',
    'ตารางที่ 4.5 ผลการทดสอบ E2E ด้วย Playwright — Comprehensive Suite (Chromium)':
        'ตารางที่ 4.6 ผลการทดสอบ E2E ด้วย Playwright — Comprehensive Suite (Chromium)',
    'ตารางที่ 4.1 ผลการทดสอบ UAT (User Acceptance Testing)':
        'ตารางที่ 4.7 ผลการทดสอบ UAT (User Acceptance Testing)',
    'ตารางที่ 4.2 สรุปผลการทดสอบความพึงพอใจ':
        'ตารางที่ 4.8 สรุปผลการทดสอบความพึงพอใจ',
}

tbl_fixed = 0
for para in doc.paragraphs:
    txt = para.text.strip()
    if txt in TABLE_RENAMES:
        new_txt = TABLE_RENAMES[txt]
        for run in para.runs:
            run.text = ''
        if para.runs:
            para.runs[0].text = new_txt
        else:
            para.add_run(new_txt)
        print(f'  Table: {repr(txt[:60])} → {repr(new_txt[:60])}')
        tbl_fixed += 1

print(f'  Fixed {tbl_fixed} table captions')

# ════════════════════════════════════════════════════════════════════════════════
# STEP 3 — Insert System Requirements Table before §3.2
# ════════════════════════════════════════════════════════════════════════════════
print("\nStep 3: Inserting System Requirements Table (ตารางที่ 3.5)...")

arch_heading = None
for para in doc.paragraphs:
    if para.text.strip() == '3.2 สถาปัตยกรรมของระบบ (System Architecture)':
        arch_heading = para
        break

if not arch_heading:
    print("  WARNING: §3.2 heading not found — skipping requirements table")
else:
    # Insert before §3.2 (= insert all content using addprevious, in reverse)
    # We'll build content top-down, inserting each before §3.2 then shifting anchor
    # Simpler: find paragraph just before §3.2 and insert_after repeatedly
    paras = doc.paragraphs
    arch_idx = next(i for i, p in enumerate(paras) if p._p is arch_heading._p)
    prev_para = paras[arch_idx - 1]   # paragraph just before §3.2

    cur = prev_para

    cur = insert_after(cur, '')
    cur = insert_after(cur, 'ตารางที่ 3.5 ความต้องการของระบบ TAS (Functional และ Non-Functional Requirements)',
                       bold=True, center=True)
    cur = insert_after(cur, '')

    # Functional Requirements header
    cur = insert_after(cur, 'ก. ความต้องการด้านฟังก์ชัน (Functional Requirements)', bold=True)

    FR_ROWS = [
        ('ID', 'ความต้องการ', 'ระดับความสำคัญ'),
        ('FR-01', 'ลงทะเบียน / เข้าสู่ระบบ / ออกจากระบบ (Local Authentication)', 'สูง'),
        ('FR-02', 'เข้าสู่ระบบผ่าน Google / GitHub (Social Login)', 'สูง'),
        ('FR-03', 'OAuth 2.0 Authorization Code + PKCE (สำหรับ third-party apps)', 'สูง'),
        ('FR-04', 'JWT RS256 access token (1 ชม.) + refresh token (30 วัน)', 'สูง'),
        ('FR-05', 'จัดการ session: แสดงรายการ, ยกเลิกเดี่ยว, ยกเลิกทั้งหมด', 'สูง'),
        ('FR-06', 'รีเซ็ตรหัสผ่านผ่านอีเมล (secure token, 1 ชม. TTL)', 'สูง'),
        ('FR-07', 'จัดการโปรไฟล์ผู้ใช้ / ค่าส่วนตัว (theme, language, notifications)', 'กลาง'),
        ('FR-08', 'PDPA: ส่งออกข้อมูลส่วนตัว / ลบบัญชีถาวร', 'สูง'),
        ('FR-09', 'Admin dashboard: analytics, monitoring, audit logs', 'กลาง'),
        ('FR-10', 'Rate limiting + account lockout (brute-force protection)', 'สูง'),
    ]
    for row in FR_ROWS:
        cur = insert_after(cur, ' | '.join(row))

    cur = insert_after(cur, '')
    cur = insert_after(cur, 'ข. ความต้องการที่ไม่ใช่ฟังก์ชัน (Non-Functional Requirements)', bold=True)

    NFR_ROWS = [
        ('ID', 'ความต้องการ', 'เกณฑ์ที่ยอมรับได้'),
        ('NFR-01', 'Response time', '≤ 500 ms (P95) ภายใต้โหลดปกติ (≤ 100 concurrent users)'),
        ('NFR-02', 'Scalability', 'รองรับ ≥ 100 VU พร้อมกัน; scale ออกได้ด้วย Nginx load balancer'),
        ('NFR-03', 'Security', 'ผ่าน OWASP ZAP Baseline Scan: 0 FAIL, ≤ 15 WARN'),
        ('NFR-04', 'Availability', '≥ 99% uptime ด้วย 3 instances + health-check auto-restart'),
        ('NFR-05', 'PDPA Compliance', 'รองรับ 6 สิทธิ์ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562'),
        ('NFR-06', 'Maintainability', 'Monolithic architecture; Dockerized; config ผ่าน .env'),
    ]
    for row in NFR_ROWS:
        cur = insert_after(cur, ' | '.join(row))

    cur = insert_after(cur, '')
    print('  → Inserted ตารางที่ 3.5 (FR + NFR requirements) before §3.2')

# ════════════════════════════════════════════════════════════════════════════════
# STEP 4 — Insert Jest Unit/Integration Test Table (ตารางที่ 4.1) before §4.2.1
# ════════════════════════════════════════════════════════════════════════════════
print("\nStep 4: Inserting Jest test results table (ตารางที่ 4.1)...")

sec421 = None
for para in doc.paragraphs:
    if '4.2.1' in para.text and 'Functional Testing' in para.text:
        sec421 = para
        break

if not sec421:
    print("  WARNING: §4.2.1 heading not found — skipping Jest table")
else:
    # Read Jest data from Excel
    wb = openpyxl.load_workbook('TAS-Tables.xlsx')
    ws = wb['Table 2 Test Breakdown']
    jest_rows = []
    for row in ws.iter_rows(values_only=True):
        if row[0] is not None:
            jest_rows.append(row)

    # Insert before §4.2.1 (find paragraph just before it)
    paras = doc.paragraphs
    idx421 = next(i for i, p in enumerate(paras) if p._p is sec421._p)
    prev = paras[idx421 - 1]

    cur = prev
    cur = insert_after(cur, '')
    cur = insert_after(cur,
        'ตารางที่ 4.1 ผลการทดสอบ Unit/Integration Testing ด้วย Jest v29 (104 test cases)',
        bold=True, center=True)
    cur = insert_after(cur, '')

    for row in jest_rows:
        cells = [str(c) if c is not None else '' for c in row]
        cur = insert_after(cur, ' | '.join(cells))

    cur = insert_after(cur, '')
    print(f'  → Inserted ตารางที่ 4.1 with {len(jest_rows)} rows before §4.2.1')

# ════════════════════════════════════════════════════════════════════════════════
# STEP 5 — Insert Test Summary Table after §4.2 heading
# ════════════════════════════════════════════════════════════════════════════════
print("\nStep 5: Inserting Test Summary Table after §4.2...")

sec42 = None
for para in doc.paragraphs:
    if para.text.strip() == '4.2 การทดสอบระบบ':
        sec42 = para
        break

if not sec42:
    print("  WARNING: §4.2 heading not found — skipping test summary table")
else:
    cur = sec42
    cur = insert_after(cur, '')
    cur = insert_after(cur,
        'ตารางที่ 4.X สรุปผลการทดสอบระบบ TAS Authentication Server ทุกประเภท',
        bold=True, center=True)
    cur = insert_after(cur, '')

    SUMMARY_ROWS = [
        ('ประเภทการทดสอบ', 'เครื่องมือ', 'Test Cases', 'ผ่าน', 'หมายเหตุ'),
        ('Unit & Integration', 'Jest v29', '104', '104/104 (100%)', '27 กลุ่มทดสอบ; 6 ไฟล์ทดสอบ'),
        ('Functional API', 'Postman/Newman v6', '31 requests / 70 assertions', '69/70 (98.6%)', 'logout 504 timeout (known bug)'),
        ('E2E Browser', 'Playwright v1.x (Chromium)', '186', '182/186 (97.8%)', '4 skip — OAuth state dependency'),
        ('Performance', 'k6 v1.7', '4 scenarios (100/500 VU)', '—', 'rate-limit โดยตั้งใจ (ไม่ใช่ bug)'),
        ('Security', 'OWASP ZAP v2.16', '55 passive checks', '0 FAIL / 55 PASS', '12 WARN (CSP, SRI, server version)'),
        ('UAT', 'Manual (5 users)', '15 test cases', '15/15 (100%)', 'ความพึงพอใจเฉลี่ย 4.70 / 5.0'),
    ]
    for row in SUMMARY_ROWS:
        cur = insert_after(cur, ' | '.join(row))

    cur = insert_after(cur, '')
    print('  → Inserted ตารางที่ 4.X (6-row test summary) after §4.2 heading')

# ════════════════════════════════════════════════════════════════════════════════
doc.save('TAS6-final.docx')
print('\nDone. Saved TAS6-final.docx')
print(f'  {sec_fixed} section headings fixed')
print(f'  {tbl_fixed} table captions fixed')
print('  ตารางที่ 3.5 requirements table added')
print('  ตารางที่ 4.1 Jest unit test table added')
print('  ตารางที่ 4.X test summary table added')
