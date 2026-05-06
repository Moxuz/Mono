"""
Fix Table[2] API endpoints — correct 7 wrong paths/methods and replace 3 non-existent routes
"""
import sys, shutil
from docx import Document

sys.stdout.reconfigure(encoding='utf-8')

DOC_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx"
BAK_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx.bak_api"

shutil.copy2(DOC_PATH, BAK_PATH)
print(f'Backup: {BAK_PATH}')

doc = Document(DOC_PATH)
t = doc.tables[2]
log = []

def set_cell_text(cell, text):
    """Replace all text in a cell, preserving the first run's font/style."""
    for para in cell.paragraphs:
        if para.runs:
            # Keep first run's formatting, clear rest
            para.runs[0].text = text
            for r in para.runs[1:]:
                r.text = ''
            text = ''  # subsequent paragraphs cleared
        else:
            if text:
                para.add_run(text)
                text = ''

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
            log.append(f'  OK  {label}: "{old}" → "{new}"')
            return True
    log.append(f'  SKP {label}: "{old}" not found')
    return False

print('\n=== Fixing wrong paths/methods ===')

# R04: /api/auth/refresh → /api/auth/refresh-token
fix_cell(t.rows[4].cells[2], '/api/auth/refresh', '/api/auth/refresh-token', 'R04-path')

# R06: PUT /api/auth/profile → PUT /api/users/profile
fix_cell(t.rows[6].cells[2], '/api/auth/profile', '/api/users/profile', 'R06-path')

# R12: method PUT → POST for change-password
fix_cell(t.rows[12].cells[1], 'PUT', 'POST', 'R12-method')

# R16: /api/auth/export-data → /api/users/export
fix_cell(t.rows[16].cells[2], '/api/auth/export-data', '/api/users/export', 'R16-path')

# R20: DELETE → POST, /api/auth/sessions/:id → /api/auth/sessions/revoke
fix_cell(t.rows[20].cells[1], 'DELETE', 'POST', 'R20-method')
fix_cell(t.rows[20].cells[2], '/api/auth/sessions/:id', '/api/auth/sessions/revoke', 'R20-path')
fix_cell(t.rows[20].cells[4], 'ยกเลิก session ที่ระบุ', 'ยกเลิก session ที่ระบุ (ส่ง sessionId ใน body)', 'R20-desc')

# R21: DELETE → POST, /api/auth/sessions → /api/auth/sessions/revoke-all-others
fix_cell(t.rows[21].cells[1], 'DELETE', 'POST', 'R21-method')
fix_cell(t.rows[21].cells[2], '/api/auth/sessions', '/api/auth/sessions/revoke-all-others', 'R21-path')
fix_cell(t.rows[21].cells[4], 'ยกเลิก session ทั้งหมด (ออกจากทุกอุปกรณ์)', 'ยกเลิก session อื่น ๆ ทั้งหมด (คงเฉพาะ session ปัจจุบัน)', 'R21-desc')

# R39: /api/users/:id/role → /api/users/:id
fix_cell(t.rows[39].cells[2], '/api/users/:id/role', '/api/users/:id', 'R39-path')
fix_cell(t.rows[39].cells[4], 'เปลี่ยน role ของผู้ใช้ (เฉพาะ admin)', 'อัปเดตข้อมูลผู้ใช้ / เปลี่ยน role (เฉพาะ admin)', 'R39-desc')

print('\n=== Replacing non-existent routes ===')

# R13: POST /api/auth/resend-verification → POST /api/auth/validate-token
#   cat stays as-is (auth), method=POST, path changes, auth=No, desc changes
fix_cell(t.rows[13].cells[0], 'Email', 'การยืนยันตัวตนหลัก', 'R13-cat')
fix_cell(t.rows[13].cells[2], '/api/auth/resend-verification', '/api/auth/validate-token', 'R13-path')
fix_cell(t.rows[13].cells[3], 'Yes', 'No', 'R13-auth')
fix_cell(t.rows[13].cells[4], 'ส่งลิงก์ยืนยันอีเมลอีกครั้ง', 'ตรวจสอบความถูกต้องของ JWT token', 'R13-desc')

# R14: GET /api/auth/verify-email/:token → DELETE /api/oauth/consents/:clientId
fix_cell(t.rows[14].cells[0], 'Email', 'PDPA', 'R14-cat')
fix_cell(t.rows[14].cells[1], 'GET', 'DELETE', 'R14-method')
fix_cell(t.rows[14].cells[2], '/api/auth/verify-email/:token', '/api/oauth/consents/:clientId', 'R14-path')
fix_cell(t.rows[14].cells[3], 'No', 'Yes', 'R14-auth')
fix_cell(t.rows[14].cells[4], 'ยืนยันที่อยู่อีเมลด้วย token', 'ถอนความยินยอม OAuth client (PDPA มาตรา 19)', 'R14-desc')

# R44: GET /api/auth/silent-auth → GET /api/oauth/authorize
fix_cell(t.rows[44].cells[0], 'สถานะระบบ', 'OAuth 2.0', 'R44-cat')
fix_cell(t.rows[44].cells[2], '/api/auth/silent-auth', '/api/oauth/authorize', 'R44-path')
fix_cell(t.rows[44].cells[4], 'การยืนยันตัวตนแบบไม่แสดงผล (iframe / SPA)', 'แสดงหน้ายืนยันสิทธิ์ Authorization (GET = form, POST = submit)', 'R44-desc')

# ── Verify ────────────────────────────────────────────────────────────────────
print('\n=== Verification ===')
checks = [
    (4,  2, '/api/auth/refresh-token'),
    (6,  2, '/api/users/profile'),
    (12, 1, 'POST'),
    (16, 2, '/api/users/export'),
    (20, 1, 'POST'),
    (20, 2, '/api/auth/sessions/revoke'),
    (21, 1, 'POST'),
    (21, 2, '/api/auth/sessions/revoke-all-others'),
    (39, 2, '/api/users/:id'),
    (13, 0, 'การยืนยันตัวตนหลัก'),
    (13, 2, '/api/auth/validate-token'),
    (14, 0, 'PDPA'),
    (14, 1, 'DELETE'),
    (14, 2, '/api/oauth/consents/:clientId'),
    (44, 0, 'OAuth 2.0'),
    (44, 2, '/api/oauth/authorize'),
]

all_pass = True
for ri, ci, expected in checks:
    actual = t.rows[ri].cells[ci].text.strip()
    ok = expected in actual
    if not ok:
        all_pass = False
    status = 'PASS' if ok else 'FAIL'
    print(f'  {status}: R{ri:02d}C{ci} contains "{expected}" | actual="{actual[:70]}"')

doc.save(DOC_PATH)
print(f'\nSaved: {DOC_PATH}')

print('\n=== Change log ===')
for e in log:
    print(e)

print(f'\nResult: {"ALL PASS" if all_pass else "SOME FAILED"}')
