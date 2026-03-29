"""
update_postman.py — adds Postman/Newman API test results to §4.2.5 in TAS6-final.docx
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

# Find anchor: end of ZAP section (the tool footnote line)
anchor = None
for para in doc.paragraphs:
    if 'ZAP v2.16' in para.text and '29' in para.text:
        anchor = para
        print(f"Found ZAP anchor: {para.text[:70]}")
        break

if not anchor:
    # fallback: find the ZAP summary paragraph
    for para in doc.paragraphs:
        if 'server_tokens off' in para.text:
            anchor = para
            print(f"Fallback anchor: {para.text[:70]}")
            break

if not anchor:
    print("ERROR: Could not find anchor"); exit(1)

print("Inserting section 4.2.5 Postman/Newman API Testing...")
cur = anchor

cur = insert_after(cur, '')

cur = insert_after(cur,
    '4.2.5 API Functional Testing (Postman / Newman)',
    bold=True)

cur = insert_after(cur,
    'ทำการทดสอบ API endpoints แบบ Functional ด้วย Postman Collection '
    'ที่รันผ่าน Newman v6.2.2 (Postman CLI runner) '
    'ครอบคลุม 6 กลุ่ม endpoint หลักของระบบ '
    'ทดสอบทั้ง happy path และ negative cases (การส่ง token ไม่ถูกต้อง, missing fields, unauthenticated access)')

cur = insert_after(cur, '')

cur = insert_after(cur,
    'ตารางที่ 4.4 ผลการทดสอบ API ด้วย Postman/Newman (Functional Test Results)',
    bold=True)

rows = [
    ('Group', 'Requests', 'Assertions', 'Pass', 'Fail'),
    ('00 — Health & Well-Known', '2', '7', '7', '0'),
    ('01 — Authentication', '9', '22', '21', '1*'),
    ('02 — User Management', '4', '9', '9', '0'),
    ('03 — Sessions', '3', '7', '7', '0'),
    ('04 — OAuth 2.0', '6', '14', '14', '0'),
    ('05 — Security Headers & Rate Limit', '4', '8', '8', '0'),
    ('06 — Dashboard (Admin)', '3', '3', '3', '0'),
    ('TOTAL', '31', '70', '69', '1*'),
]
for row in rows:
    cur = insert_after(cur, ' | '.join(row))

cur = insert_after(cur, '')

cur = insert_after(cur,
    '* หมายเหตุ: 1 assertion ที่ไม่ผ่านคือ POST /api/auth/logout ซึ่งได้รับ 504 Gateway Timeout '
    'เนื่องจาก logout handler ใช้เวลา >60 วินาที (เกิน Nginx proxy_read_timeout) '
    'สาเหตุ: passport req.logout() callback รอ Redis session destroy ที่ใช้เวลานาน '
    'ในสถานการณ์จริง logout สำเร็จแต่ client ได้รับ timeout error ก่อน '
    'จะแก้ไขด้วยการเพิ่ม timeout และ background processing',
    italic=True)

cur = insert_after(cur, '')

cur = insert_after(cur,
    'ผลการทดสอบหลัก:')

findings = [
    'Health endpoint: ตอบสนองใน < 500ms ทุกครั้ง (actual: ~25-55ms)',
    'OpenID Configuration: มี issuer, authorization_endpoint, token_endpoint ครบถ้วน (RFC 8414)',
    'Authentication: Login/Register/Refresh/Forgot-Password ทำงานถูกต้อง; ป้องกัน wrong password (401) และ missing fields (400)',
    'User Management: GET /api/users/me และ PUT /api/users/profile ทำงานถูกต้อง; block unauthenticated access (401)',
    'Sessions: GET /api/sessions และ revoke-all-others ทำงานถูกต้องพร้อม Redis-backed session sharing',
    'OAuth 2.0: Client registration, listing, introspect, userinfo ทำงานถูกต้อง',
    'Security Headers: X-Content-Type-Options, X-XSS-Protection, Content-Security-Policy ครบ; ไม่มี X-Powered-By',
    'Access Control: Dashboard endpoints ทั้ง 3 ถูกปฏิเสธ (401) เมื่อไม่มี authentication',
    'Error handling: 404 endpoint ไม่พบ, 401 unauthenticated, 400 bad request — ทุก case ตอบสนองถูกต้อง',
]
for f in findings:
    cur = insert_after(cur, f'- {f}')

cur = insert_after(cur, '')
cur = insert_after(cur,
    'เครื่องมือที่ใช้: Newman v6.2.2, Postman Collection v2.1, '
    'จำนวน endpoints ที่ทดสอบ: 31 requests, 69/70 assertions ผ่าน (98.6%), '
    'Known issue: logout timeout (504) — documented for future fix',
    italic=True)

doc.save('TAS6-final.docx')
print("Saved TAS6-final.docx with §4.2.5 Postman/Newman results")
