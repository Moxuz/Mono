import sys
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document

docx_path = r'C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS-Complete-Thesis-MONOLITH-FINAL.docx'
doc = Document(docx_path)

def get_full_text(para):
    return ''.join(run.text for run in para.runs)

def replace_in_para(para, old, new):
    full = get_full_text(para)
    if old not in full:
        return False
    new_full = full.replace(old, new)
    if para.runs:
        para.runs[0].text = new_full
        for run in para.runs[1:]:
            run.text = ''
    return True

# The correct API table to replace the current wrong one
OLD_TABLE = """Authentication Endpoints:
POST   /api/auth/register          - ลงทะเบียนผู้ใช้ใหม่
POST   /api/auth/login             - เข้าสู่ระบบ
POST   /api/auth/logout            - ออกจากระบบ
POST   /api/auth/forgot-password   - ขอรหัสผ่านใหม่
POST   /api/auth/reset-password/:token - รีเซ็ตรหัสผ่าน
GET    /api/auth/verify-email      - ยืนยันอีเมล
GET    /api/auth/google            - Google OAuth
GET    /api/auth/github            - GitHub OAuth
GET    /api/auth/profile           - ดูข้อมูลโปรไฟล์
PUT    /api/auth/profile           - แก้ไขโปรไฟล์
POST   /api/auth/change-password   - เปลี่ยนรหัสผ่าน
DELETE /api/auth/account           - ลบบัญชี

OAuth 2.0 Endpoints:
GET    /api/oauth/authorize        - ขอ authorization
POST   /api/oauth/authorize        - ยืนยัน authorization
POST   /api/oauth/token            - แลกเปลี่ยน token
GET    /api/oauth/userinfo         - ดึงข้อมูลผู้ใช้
POST   /api/oauth/clients          - ลงทะเบียน client ใหม่
GET    /api/oauth/clients          - ดูรายการ clients
GET    /api/oauth/clients/:id      - ดูข้อมูล client
PUT    /api/oauth/clients/:id      - แก้ไข client
DELETE /api/oauth/clients/:id      - ลบ client
POST   /api/oauth/revoke           - ยกเลิก token
POST   /api/oauth/introspect       - ตรวจสอบ token

Session Endpoints:
GET    /api/sessions               - ดูเซสชันทั้งหมด
DELETE /api/sessions/:id           - ยกเลิกเซสชัน
DELETE /api/sessions/all           - ยกเลิกทุกเซสชัน

User Management Endpoints:
GET    /api/users                  - ดูรายการผู้ใช้ (Admin)
GET    /api/users/:id              - ดูข้อมูลผู้ใช้
PUT    /api/users/:id              - แก้ไขข้อมูลผู้ใช้
DELETE /api/users/:id              - ลบผู้ใช้

Dashboard Endpoints:
GET    /api/dashboard/analytics    - ดูสถิติ
GET    /api/dashboard/logs         - ดู logs
GET    /api/dashboard/monitoring   - ดูสถานะระบบ
GET    /api/dashboard/redis/health - ตรวจสอบ Redis"""

NEW_TABLE = """Authentication Endpoints:
POST   /api/auth/register                - ลงทะเบียนผู้ใช้ใหม่
POST   /api/auth/login                   - เข้าสู่ระบบ
POST   /api/auth/logout                  - ออกจากระบบ
POST   /api/auth/refresh-token           - ต่ออายุ access token
POST   /api/auth/validate-token          - ตรวจสอบความถูกต้อง token
GET    /api/auth/verify-email            - ยืนยันอีเมล
POST   /api/auth/resend-verification     - ส่งอีเมลยืนยันใหม่
POST   /api/auth/forgot-password         - ขอรหัสผ่านใหม่
POST   /api/auth/reset-password/:token   - รีเซ็ตรหัสผ่าน
POST   /api/auth/change-password         - เปลี่ยนรหัสผ่าน
GET    /api/auth/profile                 - ดูข้อมูลโปรไฟล์
DELETE /api/auth/delete-account          - ลบบัญชีผู้ใช้
GET    /api/auth/preferences             - ดูการตั้งค่าผู้ใช้
PUT    /api/auth/preferences             - แก้ไขการตั้งค่าผู้ใช้
GET    /api/auth/audit-logs              - ดู audit logs
GET    /api/auth/security-audit          - ดู security events
POST   /api/auth/emergency-lockdown      - ยกเลิกทุก sessions ฉุกเฉิน

Social Login Endpoints:
GET    /api/auth/oauth/status            - ตรวจสอบ providers ที่เปิดใช้งาน
GET    /api/auth/google                  - เริ่ม Google OAuth
GET    /api/auth/google/callback         - Google OAuth callback
GET    /api/auth/github                  - เริ่ม GitHub OAuth
GET    /api/auth/github/callback         - GitHub OAuth callback

OAuth 2.0 Endpoints:
GET    /api/oauth/authorize              - แสดงหน้า authorization
POST   /api/oauth/authorize              - ยืนยัน/ปฏิเสธ authorization
POST   /api/oauth/token                  - แลกเปลี่ยน authorization code เป็น token
GET    /api/oauth/userinfo               - ดึงข้อมูลผู้ใช้ (Bearer token)
POST   /api/oauth/introspect             - ตรวจสอบ token
POST   /api/oauth/revoke                 - ยกเลิก token
POST   /api/oauth/clients                - ลงทะเบียน OAuth client ใหม่
GET    /api/oauth/clients                - ดูรายการ OAuth clients
GET    /api/oauth/clients/:id            - ดูข้อมูล OAuth client
PUT    /api/oauth/clients/:id            - แก้ไข OAuth client
DELETE /api/oauth/clients/:id            - ลบ OAuth client

Session Endpoints:
GET    /api/sessions                     - ดูเซสชันทั้งหมด
GET    /api/sessions/count               - นับจำนวนเซสชันที่ active
DELETE /api/sessions/:sessionId          - ยกเลิกเซสชันที่ระบุ
DELETE /api/sessions/others/all          - ยกเลิกเซสชันอื่นทั้งหมด
DELETE /api/sessions/all                 - ยกเลิกทุกเซสชัน

User Endpoints:
GET    /api/users/me                     - ดูข้อมูลผู้ใช้ปัจจุบัน
GET    /api/users/profile                - ดูโปรไฟล์ผู้ใช้
PUT    /api/users/profile                - แก้ไขโปรไฟล์ผู้ใช้
DELETE /api/users/account                - ลบบัญชีผู้ใช้
GET    /api/users/export                 - Export ข้อมูลผู้ใช้
GET    /api/users                        - ดูรายการผู้ใช้ (Admin)
GET    /api/users/:id                    - ดูข้อมูลผู้ใช้ (Admin)
DELETE /api/users/:id                    - ลบผู้ใช้ (Admin)

Dashboard Endpoints:
GET    /api/dashboard/analytics/users    - สถิติผู้ใช้
GET    /api/dashboard/analytics/logins   - สถิติการเข้าสู่ระบบ
GET    /api/dashboard/analytics/security - สถิติความปลอดภัย
GET    /api/dashboard/logs/security      - Security logs (Admin)
GET    /api/dashboard/logs/logins        - Login history (Admin)
GET    /api/dashboard/monitoring/health  - System health (Admin)
GET    /api/dashboard/user/activity      - กิจกรรมผู้ใช้
GET    /api/dashboard/user/login-history - ประวัติการเข้าสู่ระบบ
GET    /api/dashboard/health/redis       - ตรวจสอบ Redis

Well-Known Endpoints:
GET    /.well-known/openid-configuration - OIDC discovery document
GET    /.well-known/jwks.json            - JSON Web Key Set"""

changes = []
for i, para in enumerate(doc.paragraphs):
    text = get_full_text(para)
    # Match on a distinctive substring to find the right paragraph
    if 'Authentication Endpoints:' in text and 'POST   /api/auth/register' in text:
        # Check the old table is there
        # The old and new tables differ - do a targeted replacement
        ok = replace_in_para(para, OLD_TABLE, NEW_TABLE)
        if ok:
            changes.append(f'[{i}] API Endpoints table: fully updated')
        else:
            # The text might not match exactly due to encoding/whitespace - try a partial match
            # Find and replace the wrong routes individually
            fixes = [
                # Wrong route fixes
                ('PUT    /api/auth/profile           - แก้ไขโปรไฟล์\n', ''),
                ('DELETE /api/auth/account           - ลบบัญชี', 'DELETE /api/auth/delete-account          - ลบบัญชีผู้ใช้'),
                # Wrong user routes
                ('GET    /api/users                  - ดูรายการผู้ใช้ (Admin)', 'GET    /api/users/me                     - ดูข้อมูลผู้ใช้ปัจจุบัน\nGET    /api/users/profile                - ดูโปรไฟล์ผู้ใช้\nPUT    /api/users/profile                - แก้ไขโปรไฟล์ผู้ใช้\nDELETE /api/users/account                - ลบบัญชีผู้ใช้\nGET    /api/users/export                 - Export ข้อมูลผู้ใช้\nGET    /api/users                        - ดูรายการผู้ใช้ (Admin)'),
                ('GET    /api/users/:id              - ดูข้อมูลผู้ใช้', 'GET    /api/users/:id                    - ดูข้อมูลผู้ใช้ (Admin)'),
                ('PUT    /api/users/:id              - แก้ไขข้อมูลผู้ใช้\n', ''),
                ('DELETE /api/users/:id              - ลบผู้ใช้', 'DELETE /api/users/:id                    - ลบผู้ใช้ (Admin)'),
                # Wrong dashboard routes
                ('GET    /api/dashboard/analytics    - ดูสถิติ', 'GET    /api/dashboard/analytics/users    - สถิติผู้ใช้\nGET    /api/dashboard/analytics/logins   - สถิติการเข้าสู่ระบบ'),
                ('GET    /api/dashboard/logs         - ดู logs', 'GET    /api/dashboard/logs/security      - Security logs (Admin)\nGET    /api/dashboard/logs/logins        - Login history (Admin)'),
                ('GET    /api/dashboard/monitoring   - ดูสถานะระบบ', 'GET    /api/dashboard/monitoring/health  - System health (Admin)'),
                ('GET    /api/dashboard/redis/health - ตรวจสอบ Redis', 'GET    /api/dashboard/health/redis       - ตรวจสอบ Redis\nGET    /api/dashboard/user/activity      - กิจกรรมผู้ใช้\nGET    /api/dashboard/user/login-history - ประวัติการเข้าสู่ระบบ'),
                # Add session count + others
                ('DELETE /api/sessions/:id           - ยกเลิกเซสชัน', 'GET    /api/sessions/count               - นับจำนวนเซสชัน active\nDELETE /api/sessions/:sessionId          - ยกเลิกเซสชันที่ระบุ\nDELETE /api/sessions/others/all          - ยกเลิกเซสชันอื่นทั้งหมด'),
            ]
            for old_str, new_str in fixes:
                ok2 = replace_in_para(para, old_str, new_str)
                if ok2:
                    changes.append(f'[{i}] Fixed: "{old_str[:50].strip()}"')

doc.save(docx_path)
print(f'Done. {len(changes)} change(s):')
for c in changes:
    print(f'  {c}')
