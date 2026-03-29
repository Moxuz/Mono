"""
update_zap.py — adds OWASP ZAP security test results section to TAS6-final.docx
Inserts §4.2.4 Security Testing (OWASP ZAP) after the performance section
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
from docx.oxml import OxmlElement
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document('TAS6-final.docx')

def insert_after(ref_para, text, bold=False, italic=False, size=None):
    new_p = OxmlElement('w:p')
    ref_para._p.addnext(new_p)
    paras = doc.paragraphs
    ref_idx = next(i for i, p in enumerate(paras) if p._p is ref_para._p)
    new_para = paras[ref_idx + 1]
    if text:
        run = new_para.add_run(text)
        run.bold = bold
        run.italic = italic
        if size:
            run.font.size = Pt(size)
    return new_para

# ── Find anchor: end of §4.2.3 performance section ───────────────────────────
# Look for the Phase 2 summary paragraph we inserted earlier
anchor = None
for para in doc.paragraphs:
    if 'automatic failover' in para.text or ('horizontal scaling' in para.text and 'instances' in para.text and 'Redis session store' in para.text):
        anchor = para
        print(f"Found anchor: {para.text[:80]}")
        break

if not anchor:
    # fallback: find "k6 v1.7.0" tool footnote
    for para in doc.paragraphs:
        if 'k6 v1.7.0' in para.text:
            anchor = para
            print(f"Fallback anchor: {para.text[:80]}")
            break

if not anchor:
    print("ERROR: Could not find anchor paragraph")
    exit(1)

# ── Insert §4.2.4 ZAP Security Testing section ───────────────────────────────
print("Inserting §4.2.4 OWASP ZAP Security Testing section...")
cur = anchor

cur = insert_after(cur, '')

cur = insert_after(cur,
    '4.2.4 Security Testing (การทดสอบความปลอดภัย — OWASP ZAP)',
    bold=True)

cur = insert_after(cur,
    'ทำการทดสอบความปลอดภัยด้วย OWASP ZAP (Zed Attack Proxy) v2.16 '
    'โดยใช้ Baseline Scan แบบ Passive เพื่อตรวจหาช่องโหว่ความปลอดภัยของเว็บแอปพลิเคชัน '
    'โดยไม่มีการโจมตีเชิงรุก (Active Attack) เป้าหมายคือระบบที่รันผ่าน Nginx Load Balancer '
    'บน http://nginx (Docker internal network) สแกนทั้งหมด 42 URLs')

cur = insert_after(cur, '')

cur = insert_after(cur,
    'ตารางที่ 4.3 ผลการทดสอบความปลอดภัย OWASP ZAP Baseline Scan',
    bold=True)

# Table header
cur = insert_after(cur,
    'ระดับความเสี่ยง | จำนวน | รายละเอียด')
cur = insert_after(cur,
    '-----------------|-------|------------')
cur = insert_after(cur,
    'FAIL (High/Critical) | 0     | ไม่พบช่องโหว่ระดับสูง')
cur = insert_after(cur,
    'Medium Risk          | 4     | CSP wildcard, unsafe-eval, unsafe-inline, SRI missing')
cur = insert_after(cur,
    'Low Risk             | 4     | COEP header, debug error msg, private IP, server version')
cur = insert_after(cur,
    'Informational        | 9     | Suspicious comments, non-storable content, auth request')
cur = insert_after(cur,
    'PASS                 | 55    | ผ่านทุก check ด้านความปลอดภัยหลัก')

cur = insert_after(cur, '')

cur = insert_after(cur,
    'รายละเอียดผลการสแกน (WARN-NEW):',
    bold=True)

alerts = [
    ('Medium', 'CSP: Wildcard Directive [10055]',
     'Content Security Policy มี wildcard directive — แนะนำให้ระบุ origin ที่อนุญาตอย่างชัดเจน'),
    ('Medium', 'CSP: script-src unsafe-eval / unsafe-inline',
     'ใช้ unsafe-eval และ unsafe-inline ใน CSP เพื่อรองรับ Swagger UI และ DataTables '
     '— ยอมรับได้สำหรับ development; production ควรใช้ nonce หรือ hash แทน'),
    ('Medium', 'Sub Resource Integrity (SRI) Attribute Missing [90003]',
     'CDN scripts (jsdelivr, datatables) ไม่มี integrity attribute '
     '— ควรเพิ่ม SRI hash เพื่อป้องกัน supply chain attack'),
    ('Low', 'Server Leaks Version via "Server" Header [10036]',
     'Nginx เปิดเผย version ใน Server header — แก้ไขด้วย server_tokens off; ใน nginx.conf'),
    ('Low', 'Cross-Origin-Embedder-Policy Header Missing [90004]',
     'ไม่มี COEP header — ไม่กระทบ authentication flow แต่ควรเพิ่มสำหรับ isolation'),
    ('Low', 'Information Disclosure - Debug Error Messages [10023]',
     'พบที่ /documentation.html — ไม่ใช่ endpoint สำคัญ'),
    ('Low', 'Private IP Disclosure [2]',
     'ipHelper.js เปิดเผย private IP pattern — ควร review ว่าจำเป็นหรือไม่'),
    ('Info', 'Information Disclosure - Sensitive Info in URL [10024]',
     'ZAP spider ใส่ credentials ใน URL query string ขณะ crawl — '
     'ระบบจริงไม่ได้ส่ง credentials ผ่าน GET; เป็น ZAP spider behavior'),
]

for risk, name, desc in alerts:
    cur = insert_after(cur, f'[{risk}] {name}: {desc}')

cur = insert_after(cur, '')

cur = insert_after(cur,
    'สรุปผลการทดสอบความปลอดภัย: ระบบผ่านการสแกน OWASP ZAP โดยไม่พบช่องโหว่ระดับ '
    'High หรือ Critical (0 FAIL) จาก 42 URLs ที่ทดสอบ ช่องโหว่ระดับ Medium '
    'ที่พบล้วนเกี่ยวข้องกับ Content Security Policy ซึ่งมีการผ่อนผันเพื่อรองรับ '
    'Swagger UI และ DataTables library สำหรับ development environment '
    'ช่องโหว่ระดับ Low ที่สำคัญที่สุดคือ Server version disclosure ซึ่งสามารถแก้ไข '
    'ได้ง่ายด้วยการเพิ่ม server_tokens off ใน nginx.conf ก่อน deploy production')

cur = insert_after(cur,
    'เครื่องมือที่ใช้ทดสอบ: OWASP ZAP v2.16 (ghcr.io/zaproxy/zaproxy:stable) '
    'รูปแบบการสแกน: Baseline Passive Scan, จำนวน URL ที่สแกน: 42, '
    'วันที่ทดสอบ: 29 มีนาคม 2569',
    italic=True)

print("  ZAP section inserted successfully")

# ── Save ──────────────────────────────────────────────────────────────────────
doc.save('TAS6-final.docx')
print("\nSaved TAS6-final.docx with §4.2.4 OWASP ZAP Security Testing")
