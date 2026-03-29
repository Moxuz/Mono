"""
fix_thesis.py – applies accuracy fixes to TAS6-edited.docx based on code comparison.
Saves as TAS6-final.docx
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document('TAS6-edited.docx')

changes = []

# ─── Helper: replace text in a paragraph's runs ────────────────────────────
def replace_in_para(para, old, new):
    full = para.text
    if old not in full:
        return False
    # Try run-by-run first
    for run in para.runs:
        if old in run.text:
            run.text = run.text.replace(old, new)
            return True
    # If split across runs, clear all and put in first
    if old in para.text:
        # Rebuild: put new text in first run, clear rest
        new_full = full.replace(old, new)
        if para.runs:
            para.runs[0].text = new_full
            for r in para.runs[1:]:
                r.text = ''
            return True
    return False

# ─── Helper: insert paragraph after reference para ─────────────────────────
def insert_after(ref_para, text, bold=False, italic=False, size=None, color=None):
    new_p = OxmlElement('w:p')
    ref_para._p.addnext(new_p)
    paras = doc.paragraphs
    ref_idx = next(i for i, p in enumerate(paras) if p._p is ref_para._p)
    new_para = paras[ref_idx + 1]
    run = new_para.add_run(text)
    run.bold = bold
    run.italic = italic
    if size:
        run.font.size = Pt(size)
    if color:
        run.font.color.rgb = RGBColor(*color)
    return new_para

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 1: Module description — para [89]
# "5 โมดูล … Session Module … Security Audit Module"
# → clarify that Session is inside Auth, Audit is shared service
# ═══════════════════════════════════════════════════════════════════════════════
print("Fix 1: Module description (para 89 and 397)")
for para in doc.paragraphs:
    if 'โมดูลหลัก 5 โมดูลในโค้ดเบสเดียว' in para.text:
        old = ('ระบบประกอบด้วยโมดูลหลัก 5 โมดูลในโค้ดเบสเดียว ได้แก่ '
               '1) โมดูลยืนยันตัวตน (Authentication Module) '
               '2) โมดูล OAuth (OAuth Module) '
               '3) โมดูลจัดการผู้ใช้ (User Module) '
               '4) โมดูลจัดการเซสชัน (Session Module) '
               'และ 5) โมดูลบันทึกความปลอดภัย (Security Audit Module) '
               'การสื่อสารระหว่างโมดูลใช้ function calls โดยตรง และใช้ Apache Kafka สำหรับการบันทึกข้อมูลแบบกระจาย')
        new_txt = ('ระบบประกอบด้วยโมดูลหลัก 3 โมดูลในโค้ดเบสเดียว ได้แก่ '
                   '1) โมดูลยืนยันตัวตน (Authentication Module) ซึ่งรวมการจัดการเซสชันไว้ด้วย '
                   '2) โมดูล OAuth (OAuth Module) '
                   'และ 3) โมดูลจัดการผู้ใช้ (User Module) '
                   'นอกจากนี้ยังมี Shared Services ได้แก่ Security Audit Service และ Session Service '
                   'การสื่อสารระหว่างโมดูลใช้ function calls โดยตรง และใช้ Apache Kafka สำหรับการบันทึกข้อมูลแบบกระจาย')
        if replace_in_para(para, old, new_txt):
            changes.append('Fixed module description (abstract/intro)')
        else:
            # Just update runs directly
            if para.runs:
                para.runs[0].text = new_txt
                for r in para.runs[1:]:
                    r.text = ''
            changes.append('Fixed module description (runs rebuild)')

for para in doc.paragraphs:
    if 'ระบบถูกออกแบบด้วยสถาปัตยกรรมโมโนลิธ' in para.text and 'โมดูลหลัก 5 โมดูล' in para.text:
        if replace_in_para(para, '5 โมดูลในโค้ดเบสเดียว ดังนี้', '3 โมดูลหลักและ Shared Services ในโค้ดเบสเดียว ดังนี้'):
            changes.append('Fixed module count in §3.2 description')

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 2: Session Module heading → clarify it's part of Auth Module
# ═══════════════════════════════════════════════════════════════════════════════
print("Fix 2: Session Module clarification")
for para in doc.paragraphs:
    if para.text.strip() == '4. Session Module - โมดูลจัดการเซสชัน':
        if replace_in_para(para, '4. Session Module - โมดูลจัดการเซสชัน',
                           '4. Session Management (ส่วนหนึ่งของ Authentication Module)'):
            changes.append('Fixed Session Module label')

    if para.text.strip() == '5. Security Audit Module - โมดูลบันทึกความปลอดภัย':
        if replace_in_para(para, '5. Security Audit Module - โมดูลบันทึกความปลอดภัย',
                           '5. Security Audit Service (Shared Service — ไม่ใช่ standalone module)'):
            changes.append('Fixed Security Audit Module label')

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 3: Rate Limiting table values — update to match actual code
# Code: login=5/15min, register=3/1hr, forgotPw=5/1hr, token=10/15min
# Authorize=30/15min, introspect=20/15min, revoke=20/15min, userinfo=100/15min
# ═══════════════════════════════════════════════════════════════════════════════
print("Fix 3: Rate limiting values in §3.7 table")
rl_fixes = [
    # (old_text, new_text)
    ('Login                  | 5 requests      | 15 นาที',
     'Login                  | 5 requests      | 15 นาที'),   # already correct
    ('Register               | 3 requests      | 1 ชั่วโมง',
     'Register               | 3 requests      | 1 ชั่วโมง'),  # already correct
    ('Forgot Password        | 5 requests      | 1 ชั่วโมง',
     'Forgot Password        | 5 requests      | 1 ชั่วโมง'),  # already correct
    ('OAuth Authorize        | 30 requests     | 15 นาที',
     'OAuth Authorize        | 30 requests     | 15 นาที'),    # already correct
]
# These already match code — no change needed.
# BUT bcrypt salt rounds: thesis says 10, let's verify
print("  Rate limits already match actual code values.")

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 4: bcrypt salt rounds — thesis says "10 รอบ", check code
# Code: User.js uses bcrypt.hash(password, 10) — so 10 is correct, no change
# ═══════════════════════════════════════════════════════════════════════════════
print("Fix 4: bcrypt salt rounds — already correct (10)")

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 5: Add missing API endpoints to §3.5 section
# These exist in code but not in thesis: emergency-lockdown, validate-token,
# oauth-session, revoke-others, user export
# ═══════════════════════════════════════════════════════════════════════════════
print("Fix 5: Add missing endpoints note to §3.5")
for i, para in enumerate(doc.paragraphs):
    if '3.5 API Endpoints' in para.text:
        # Find end of §3.5 section (before §3.6)
        end_para = para
        for j in range(i+1, min(i+80, len(doc.paragraphs))):
            if '3.6' in doc.paragraphs[j].text and 'Security' in doc.paragraphs[j].text:
                end_para = doc.paragraphs[j-1]
                break

        BLUE = (0x1F, 0x4E, 0x79)
        current = insert_after(end_para, '')
        current = insert_after(current,
            'Endpoints เพิ่มเติมในระบบ (นอกเหนือจากตารางข้างต้น)',
            bold=True)
        additional = [
            'POST /api/auth/emergency-lockdown  — ยกเลิก sessions ทั้งหมดทันที (ต้อง auth)',
            'POST /api/auth/validate-token  — ตรวจสอบความถูกต้องของ token โดยไม่ต้องมี resource',
            'GET  /api/auth/oauth-session  — สร้าง session สำหรับ OAuth redirect flow',
            'POST /api/auth/sessions/revoke  — ยกเลิก session เฉพาะด้วย session ID',
            'POST /api/auth/sessions/revoke-all-others  — ยกเลิก sessions อื่นทั้งหมด ยกเว้น current',
            'GET  /api/users/export  — export ข้อมูลผู้ใช้ทั้งหมด (PDPA s.27)',
            'GET  /api/oauth/authorize  — GET version ของ authorization endpoint สำหรับ browser redirect',
            'GET  /api/sessions/count  — นับ active sessions ของ user',
        ]
        for ep in additional:
            current = insert_after(current, ep)
        changes.append('Added 8 missing endpoints to §3.5')
        print(f"  Added {len(additional)} missing endpoints after §3.5")
        break

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 6: §3.2 — clarify "5 โมดูล" in the body paragraphs
# ═══════════════════════════════════════════════════════════════════════════════
print("Fix 6: Clarifying §5.1 module count claim")
for para in doc.paragraphs:
    if 'ระบบถูกพัฒนาเป็นโค้ดเบสเดียวที่มี 5 โมดูลหลักทำงานร่วมกัน' in para.text:
        replace_in_para(para,
            'ระบบถูกพัฒนาเป็นโค้ดเบสเดียวที่มี 5 โมดูลหลักทำงานร่วมกัน',
            'ระบบถูกพัฒนาเป็นโค้ดเบสเดียวที่มี 3 โมดูลหลักและ Shared Services ทำงานร่วมกัน')
        changes.append('Fixed module count in §5.1')

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 7: Remove the invalid "PUT /api/users/:id/role" endpoint reference
# and note that role changes use a different path
# ═══════════════════════════════════════════════════════════════════════════════
print("Fix 7: Fixing user role update endpoint reference")
for para in doc.paragraphs:
    if 'users/:id/role' in para.text:
        replace_in_para(para, 'users/:id/role', 'users/:id (body includes role field)')
        changes.append('Fixed PUT /api/users/:id/role endpoint path')

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 8: Update endpoint count description in §3.5 header
# ═══════════════════════════════════════════════════════════════════════════════
print("Fix 8: Update endpoint count")
for para in doc.paragraphs:
    if 'ตารางที่ 3.1 แสดง API Endpoints ของระบบ' in para.text:
        replace_in_para(para,
            'ตารางที่ 3.1 แสดง API Endpoints ของระบบ',
            'ตารางที่ 3.1 แสดง API Endpoints หลักของระบบ (รวมทั้งหมด 56 endpoints)')
        changes.append('Updated endpoint count to 56 in §3.5')

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 9: Update rate limits in TAS-Tables.xlsx too (done separately)
# For the thesis, the §3.7 plain-text table already has correct values from code
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Save ──────────────────────────────────────────────────────────────────
doc.save('TAS6-final.docx')
print(f"\nSaved as TAS6-final.docx")
print(f"\nChanges applied ({len(changes)}):")
for c in changes:
    print(f"  - {c}")
