"""
update_playwright2.py — replaces the existing §4.2.6 Playwright section with
the comprehensive 141-test suite results in TAS6-final.docx
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
from docx.oxml import OxmlElement
from docx.shared import Pt

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

# Find the existing §4.2.6 heading to replace it
anchor = None
for para in doc.paragraphs:
    if '4.2.6' in para.text and 'Playwright' in para.text:
        anchor = para
        print(f"Found §4.2.6 heading: {para.text[:80]}")
        break

if not anchor:
    # Fallback: find by "25 test cases" line
    for para in doc.paragraphs:
        if '25 test cases' in para.text or '25/25 PASS' in para.text:
            anchor = para
            print(f"Fallback anchor: {para.text[:80]}")
            break

if not anchor:
    print("ERROR: §4.2.6 anchor not found"); exit(1)

# Replace section content by inserting after and clearing old text
# Clear the existing heading text and rewrite it
for run in anchor.runs:
    run.text = ''
run = anchor.add_run('4.2.6 End-to-End Testing (Playwright) — Comprehensive Suite')
run.bold = True

# Find all paragraphs that belong to old §4.2.6 (stop at next heading or end)
paras = doc.paragraphs
start_idx = next(i for i, p in enumerate(paras) if p._p is anchor._p)

# Remove old §4.2.6 content paragraphs (up to 40 paragraphs after heading)
to_remove = []
for i in range(start_idx + 1, min(start_idx + 60, len(paras))):
    p = paras[i]
    # Stop if we hit another section heading (bold, starts with 4.2 or 4.3 or 5.)
    txt = p.text.strip()
    if txt and any(txt.startswith(x) for x in ['4.3', '5.', 'บทที่', 'บทสรุป']):
        break
    to_remove.append(p)

for p in to_remove:
    p._element.getparent().remove(p._element)

print(f"Removed {len(to_remove)} old §4.2.6 paragraphs")

# Now insert updated content after the heading
cur = anchor

cur = insert_after(cur,
    'ทำการทดสอบแบบ End-to-End (E2E) ด้วย Playwright v1.x บน Chromium browser '
    'ครอบคลุมทั้ง UI interactions และ API calls ผ่าน browser context '
    'ทดสอบ 27 กลุ่ม (test describe) รวม 141 test cases (3 skip) '
    'ครอบคลุมทั้ง auth server (port 80) และ client app (port 3001) '
    'รวมถึง page rendering, authentication, user management, PDPA rights, '
    'session management, OAuth 2.0, dashboard analytics/monitoring/logs, '
    'security headers, input validation, rate limiting และ access control')

cur = insert_after(cur, '')

cur = insert_after(cur,
    'ตารางที่ 4.5 ผลการทดสอบ E2E ด้วย Playwright — Comprehensive Suite (Chromium)',
    bold=True)

rows = [
    ('Describe Group',                        'Tests', 'Pass', 'Skip', 'File'),
    ('01 — Page Rendering',                   '13',    '13',   '0',    'pages.spec.ts'),
    ('02 — Register',                         '5',     '5',    '0',    'auth-full.spec.ts'),
    ('03 — Login',                            '5',     '5',    '0',    'auth-full.spec.ts'),
    ('04 — Profile & Token',                  '6',     '6',    '0',    'auth-full.spec.ts'),
    ('05 — Password Management',              '4',     '4',    '0',    'auth-full.spec.ts'),
    ('06 — Preferences & Consent',            '3',     '3',    '0',    'auth-full.spec.ts'),
    ('07 — Audit & Security',                 '3',     '3',    '0',    'auth-full.spec.ts'),
    ('08 — OAuth Social',                     '3',     '3',    '0',    'auth-full.spec.ts'),
    ('09 — Logout',                           '1',     '1',    '0',    'auth-full.spec.ts'),
    ('10 — User Profile & Settings',          '5',     '5',    '0',    'user.spec.ts'),
    ('11 — PDPA Rights',                      '3',     '3',    '0',    'user.spec.ts'),
    ('12 — Sessions',                         '9',     '9',    '0',    'session.spec.ts'),
    ('13 — OIDC Discovery & JWKS',            '2',     '2',    '0',    'oauth.spec.ts'),
    ('14 — OAuth Client Management',          '5',     '2',    '3',    'oauth.spec.ts'),
    ('15 — OAuth Token Operations',           '6',     '6',    '0',    'oauth.spec.ts'),
    ('16 — Dashboard User',                   '7',     '7',    '0',    'dashboard.spec.ts'),
    ('17 — Admin Analytics',                  '7',     '7',    '0',    'dashboard.spec.ts'),
    ('18 — Admin Monitoring',                 '6',     '6',    '0',    'dashboard.spec.ts'),
    ('19 — Admin Logs',                       '8',     '8',    '0',    'dashboard.spec.ts'),
    ('20 — Security Headers',                 '12',    '12',   '0',    'security.spec.ts'),
    ('21 — Input Validation',                 '5',     '5',    '0',    'security.spec.ts'),
    ('22 — Rate Limiting',                    '2',     '2',    '0',    'security.spec.ts'),
    ('23 — Access Control',                   '2',     '2',    '0',    'security.spec.ts'),
    ('24 — Client App Pages',                 '4',     '4',    '0',    'client.spec.ts'),
    ('25 — Client Unauthenticated Control',   '5',     '5',    '0',    'client.spec.ts'),
    ('26 — Client Authenticated Session',     '5',     '5',    '0',    'client.spec.ts'),
    ('27 — Client Logout & OAuth Callbacks',  '7',     '7',    '0',    'client.spec.ts'),
    ('TOTAL',                                 '144',   '141',  '3',    '~1.2 min'),
]
for row in rows:
    cur = insert_after(cur, ' | '.join(row))

cur = insert_after(cur, '')

cur = insert_after(cur,
    'ผลการทดสอบสำคัญ:')

findings = [
    'Page Rendering (01): ทุก HTML page โหลดสำเร็จภายใน 15s; form fields ครบ; 404 ตอบ JSON error',
    'Authentication (02-09): Register validation ครบ; Login/Logout ทำงานถูกต้อง; validate-token, refresh-token, forgot-password ใช้งานได้',
    'User Management (10-11): GET/PUT profile, PDPA export (/api/users/export), session list ทำงานถูกต้อง',
    'Sessions (12): List, revoke-all-others ทำงานถูกต้อง; dashboard session endpoints ตอบสนอง 200',
    'OAuth 2.0 (13-15): OIDC discovery มีฟิลด์ครบ (issuer, endpoints, jwks_uri); introspect, userinfo, authorize ทำงานถูกต้อง',
    'Dashboard Admin (16-19): Analytics, monitoring, logs endpoints ตอบสนอง 200 สำหรับ admin; ถูกปฏิเสธ 401/403 สำหรับ regular user',
    'Security Headers (20): CSP, X-Content-Type-Options (nosniff), X-Frame-Options, Referrer-Policy ครบทุก page',
    'Input Validation (21): XSS payload, SQL injection, oversized body (>10KB), invalid email/weak password ถูก reject ถูกต้อง',
    'Rate Limiting (22): Login endpoint ตอบสนอง 200 หรือ 429 (ไม่เคย 500); repeated wrong logins ถูก rate-limit',
    'Access Control (23): 13 protected endpoints return 401 without token; cross-user access blocked (401/403/404)',
    'Client App (24-27): OAuth PKCE login redirect, session API, authenticated pages, logout, callback edge cases ทำงานถูกต้อง',
    'Known issues (3 skip): OAuth client GET/PUT/DELETE tests ต้องใช้ clientId จากการ register ก่อนหน้า (state dependency ระหว่าง test workers)',
]
for f in findings:
    cur = insert_after(cur, f'- {f}')

cur = insert_after(cur, '')
cur = insert_after(cur,
    'เครื่องมือที่ใช้: Playwright v1.x, Browser: Chromium (headless), '
    'Test files: 8 spec files + helpers.ts, '
    'จำนวน test cases: 144 รวม (141 pass, 3 skip), '
    'เวลารวม: ~1.2 นาที (parallel execution ด้วย 8 workers)',
    italic=True)

doc.save('TAS6-final.docx')
print("Saved TAS6-final.docx with updated §4.2.6 (comprehensive 141-test suite)")
