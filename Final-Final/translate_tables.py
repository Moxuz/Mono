"""
translate_tables.py — translates descriptive English text to Thai in TAS-Tables.xlsx
Keeps English: API paths, variable/field names, code terms, HTTP methods, standards (RFC, JWT, etc.)
Translates: descriptions, notes, implementation explanations, purposes, test group names
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import openpyxl
from openpyxl import load_workbook

wb = load_workbook('TAS-Tables.xlsx')

# ── translation map: exact cell value → Thai translation ─────────────────────
TRANSLATIONS = {

    # ════ Column Headers ════
    'Category':               'หมวดหมู่',
    'Description':            'คำอธิบาย',
    'Notes':                  'หมายเหตุ',
    'Purpose':                'วัตถุประสงค์',
    'Right / Obligation':     'สิทธิ์ / ข้อผูกพัน',
    'TAS Implementation':     'การดำเนินการใน TAS',
    'Pass/Fail':              'ผล',
    'No.':                    'ลำดับ',
    'Test File':              'ไฟล์ทดสอบ',
    'describe Block':         'กลุ่มทดสอบ',
    'Test Cases':             'จำนวน test case',
    'Result':                 'ผลลัพธ์',

    # ════ API Endpoints — Category column ════
    'Auth Core':              'การยืนยันตัวตนหลัก',
    'Password':               'จัดการรหัสผ่าน',
    'Sessions':               'การจัดการ session',
    'Social Login':           'เข้าสู่ระบบด้วยบัญชีโซเชียล',
    'Well-Known':             'Well-Known (OIDC Discovery)',
    'Health':                 'สถานะระบบ',

    # ════ API Endpoints — Description column ════
    'Register new user':
        'ลงทะเบียนผู้ใช้ใหม่',
    'Login, get access+refresh tokens':
        'เข้าสู่ระบบ รับ access token และ refresh token',
    'Logout, blacklist tokens':
        'ออกจากระบบ ยกเลิก token',
    'Exchange refresh token for new access token':
        'แลก refresh token เพื่อรับ access token ใหม่',
    'Get current user profile':
        'ดึงข้อมูลโปรไฟล์ของผู้ใช้ปัจจุบัน',
    'Update user profile':
        'อัปเดตโปรไฟล์ผู้ใช้',
    'Get preferences (theme, language, notifications)':
        'ดึงการตั้งค่า (theme, language, notifications)',
    'Update preferences':
        'อัปเดตการตั้งค่า',
    'Delete account (requires password confirmation)':
        'ลบบัญชี (ต้องยืนยันรหัสผ่าน)',
    'Send password reset link via email':
        'ส่งลิงก์รีเซ็ตรหัสผ่านทางอีเมล',
    'Reset password using reset token':
        'รีเซ็ตรหัสผ่านด้วย reset token',
    'Change password (requires current password)':
        'เปลี่ยนรหัสผ่าน (ต้องใส่รหัสผ่านปัจจุบัน)',
    'Resend email verification link':
        'ส่งลิงก์ยืนยันอีเมลอีกครั้ง',
    'Verify email address with token':
        'ยืนยันที่อยู่อีเมลด้วย token',
    'Record cookie consent (PDPA s.19)':
        'บันทึกความยินยอมใช้ cookie (PDPA มาตรา 19)',
    'Export personal data as JSON (PDPA s.27)':
        'ส่งออกข้อมูลส่วนตัวในรูปแบบ JSON (PDPA มาตรา 27)',
    'Get own audit logs':
        'ดึง audit log ของตัวเอง',
    'Get security audit events':
        'ดึงเหตุการณ์ security audit',
    'List all active sessions':
        'แสดงรายการ session ที่ใช้งานอยู่ทั้งหมด',
    'Revoke a specific session':
        'ยกเลิก session ที่ระบุ',
    'Revoke all sessions (logout all devices)':
        'ยกเลิก session ทั้งหมด (ออกจากทุกอุปกรณ์)',
    'Start Google OAuth flow':
        'เริ่มกระบวนการ OAuth ผ่าน Google',
    'Google OAuth callback handler':
        'จัดการ callback จาก Google OAuth',
    'Start GitHub OAuth flow':
        'เริ่มกระบวนการ OAuth ผ่าน GitHub',
    'GitHub OAuth callback handler':
        'จัดการ callback จาก GitHub OAuth',
    'Register a new OAuth 2.0 client':
        'ลงทะเบียน OAuth 2.0 client ใหม่',
    'List all OAuth clients owned by user':
        'แสดงรายการ OAuth client ทั้งหมดของผู้ใช้',
    'Get OAuth client details by ID':
        'ดึงรายละเอียด OAuth client ตาม ID',
    'Update OAuth client metadata':
        'อัปเดตข้อมูล OAuth client',
    'Delete (soft) an OAuth client':
        'ลบ OAuth client (soft delete)',
    'Authorization endpoint - PKCE flow with credentials':
        'Endpoint สำหรับ Authorization - PKCE flow พร้อม credentials',
    'Token endpoint - code exchange or refresh_token grant':
        'Endpoint สำหรับ token - แลก code หรือ refresh_token grant',
    'Token introspection (RFC 7662)':
        'ตรวจสอบสถานะ token (RFC 7662)',
    'Token revocation (RFC 7009)':
        'ยกเลิก token (RFC 7009)',
    'List all users (admin only)':
        'แสดงรายการผู้ใช้ทั้งหมด (เฉพาะ admin)',
    'Alias for /profile':
        'ชื่อแทนของ /profile',
    'Get any user by ID (admin only)':
        'ดึงข้อมูลผู้ใช้ตาม ID (เฉพาะ admin)',
    'Change user role (admin only)':
        'เปลี่ยน role ของผู้ใช้ (เฉพาะ admin)',
    'Delete any user (admin only)':
        'ลบผู้ใช้ใดก็ได้ (เฉพาะ admin)',
    'OIDC Discovery Document (RFC 8414)':
        'เอกสาร OIDC Discovery (RFC 8414)',
    'JSON Web Key Set - public signing keys':
        'JSON Web Key Set - คีย์สาธารณะสำหรับตรวจสอบลายเซ็น',
    'Server health check':
        'ตรวจสอบสถานะเซิร์ฟเวอร์',
    'Silent re-authentication (iframe / SPA)':
        'การยืนยันตัวตนแบบไม่แสดงผล (iframe / SPA)',

    # ════ Table 3.2 JWT Config — Notes column ════
    'Asymmetric - verifiable with public key':
        'Asymmetric - ตรวจสอบได้ด้วย public key',
    'OAuth refresh token intentionally shorter':
        'OAuth refresh token ตั้งใจให้มีอายุสั้นกว่า',
    'OAuth tokens add: scope, client_id':
        'OAuth token เพิ่ม claims: scope, client_id',
    'HTTP-only cookie prevents XSS access':
        'HTTP-only cookie ป้องกันการเข้าถึงจาก XSS',
    'Old refresh token invalidated immediately':
        'refresh token เก่าถูกยกเลิกทันที (token rotation)',
    'Both tokens blacklisted on logout':
        'ทั้ง access token และ refresh token ถูกยกเลิกเมื่อออกจากระบบ',
    "Never committed to git":
        'ไม่เคย commit ขึ้น git (เก็บใน environment variable เท่านั้น)',

    # ════ Table 3.3 Rate Limiting — Purpose column ════
    'Prevent brute-force password attacks':
        'ป้องกันการโจมตีแบบ brute-force รหัสผ่าน',
    'Prevent automated account spam':
        'ป้องกันการสร้างบัญชีอัตโนมัติแบบสแปม',
    'Prevent email flooding / abuse':
        'ป้องกันการส่งอีเมลซ้ำมากเกินไป',
    'Token refresh rate limit':
        'จำกัดอัตราการ refresh token',
    'OAuth authorization flow':
        'จำกัดอัตราการใช้งาน OAuth authorization',
    'Token exchange rate limit':
        'จำกัดอัตราการแลก token',
    'Token introspection':
        'จำกัดอัตราการตรวจสอบสถานะ token',
    'Token revocation':
        'จำกัดอัตราการยกเลิก token',
    'UserInfo endpoint':
        'จำกัดอัตราการเรียก UserInfo endpoint',
    'Default unauthenticated rate':
        'อัตราเริ่มต้นสำหรับผู้ใช้ที่ไม่ได้ยืนยันตัวตน',
    'Authenticated user rate':
        'อัตราสำหรับผู้ใช้ที่ยืนยันตัวตนแล้ว',
    'Premium tier rate':
        'อัตราสำหรับผู้ใช้ระดับ premium',
    'Admin tier rate':
        'อัตราสำหรับผู้ใช้ระดับ admin',
    'Health check - not rate-limited':
        'Health check - ไม่มีการจำกัดอัตราการเข้าถึง',

    # ════ Table 3.4 PDPA — Right/Obligation + TAS Implementation ════
    'Consent (right to give/withdraw)':
        'สิทธิ์ในการให้และถอนความยินยอม',
    'Right to Access and Data Portability':
        'สิทธิ์ในการเข้าถึงและนำข้อมูลออก',
    'Right to Rectification':
        'สิทธิ์ในการแก้ไขข้อมูลให้ถูกต้อง',
    'Right to Erasure (Right to be Forgotten)':
        'สิทธิ์ในการลบข้อมูล (Right to be Forgotten)',
    'Record of Processing Activities':
        'การบันทึกกิจกรรมการประมวลผลข้อมูล',
    'Appropriate Security Measures':
        'มาตรการรักษาความปลอดภัยที่เหมาะสม',

    'cookieConsentAccepted boolean in User model with consentTimestamp; every change logged to audit':
        'ฟิลด์ cookieConsentAccepted (boolean) ใน User model พร้อม consentTimestamp; บันทึกทุกการเปลี่ยนแปลงลงใน SecurityAuditLog',
    'Full user data exported as structured JSON (profile, sessions, audit logs, preferences)':
        'ส่งออกข้อมูลผู้ใช้ทั้งหมดเป็น JSON (โปรไฟล์, sessions, audit logs, การตั้งค่า)',
    'User can update username, email, and preferences at any time':
        'ผู้ใช้สามารถอัปเดต username, email และการตั้งค่าได้ตลอดเวลา',
    'Hard delete: User document + all Sessions + TokenBlacklist entries + OAuthCodes removed atomically':
        'ลบถาวร: User document + Sessions ทั้งหมด + รายการใน TokenBlacklist + OAuthCodes ลบพร้อมกันแบบ atomic',
    'SecurityAuditLog MongoDB collection records all auth events with IP, timestamp, action, user ID':
        'MongoDB collection SecurityAuditLog บันทึกทุกเหตุการณ์ authentication พร้อม IP, timestamp, action และ user ID',
    'bcrypt cost-12, HTTPS, Helmet.js security headers, rate-limiting, JWT RS256, PKCE S256':
        'bcrypt cost-12, HTTPS, Helmet.js security headers, rate-limiting, JWT RS256, PKCE S256 (ใช้งานครอบคลุมทุก endpoint)',
    'Applied globally to all endpoints':
        'ใช้งานครอบคลุมทุก endpoint ของระบบ',

    # ════ Perf Test 4.2.3 — Pass/Fail + Note ════
    'PASS': 'ผ่าน',
    'DEGRADED (single container)':
        'ประสิทธิภาพลดลง (ทดสอบบน single container)',
    'Rate-limited (by design \ufffd 5 logins/15 min security policy)':
        'จำกัดอัตรา (โดยตั้งใจ — นโยบายความปลอดภัย 5 ครั้ง/15 นาที)',
    'Rate-limited (by design)':
        'จำกัดอัตรา (โดยตั้งใจตามนโยบายความปลอดภัย)',
    'Note: Login rate-limit (5 req/15min per IP) is a deliberate security feature, not a performance bottleneck. Profile endpoint reflects true server throughput.':
        'หมายเหตุ: rate-limit สำหรับ login (5 req/15min ต่อ IP) เป็นฟีเจอร์ความปลอดภัยที่ตั้งใจออกแบบไว้ ไม่ใช่ปัญหาด้านประสิทธิภาพ ผลลัพธ์ของ profile endpoint สะท้อน throughput จริงของเซิร์ฟเวอร์',

    # ════ Table 2 Test Breakdown — describe Block ════
    'Register':              'ลงทะเบียน',
    'Login':                 'เข้าสู่ระบบ',
    'Logout':                'ออกจากระบบ',
    'Forgot Password':       'ลืมรหัสผ่าน',
    'Reset Password':        'รีเซ็ตรหัสผ่าน',
    'Change Password':       'เปลี่ยนรหัสผ่าน',
    'List Sessions':         'แสดงรายการ session',
    'Revoke Single Session': 'ยกเลิก session เดี่ยว',
    'Revoke All Sessions':   'ยกเลิก session ทั้งหมด',
    'Get Profile':           'ดึงข้อมูลโปรไฟล์',
    'Preferences':           'การตั้งค่า',
    'Audit Logs':            'บันทึก audit log',
    'Delete Account':        'ลบบัญชี',
    'Client Registration':   'ลงทะเบียน OAuth client',
    'Revoke Token':          'ยกเลิก token',
    'Scope Enforcement':     'การบังคับใช้ scope',
    'NoSQL Injection Prevention': 'ป้องกัน NoSQL Injection',
    'Rate Limiting':         'การจำกัดอัตราการใช้งาน',
    'Token Security':        'ความปลอดภัยของ token',
    'Input Validation':      'การตรวจสอบความถูกต้องของ input',
    'All 27 describe blocks': 'ทุก 27 กลุ่มทดสอบ',
    '104/104 PASS':          '104/104 ผ่าน',
}

# ── apply translations to all sheets ─────────────────────────────────────────
changed = 0
for sn in wb.sheetnames:
    ws = wb[sn]
    for row in ws.iter_rows():
        for cell in row:
            if cell.value and isinstance(cell.value, str):
                v = cell.value
                if v in TRANSLATIONS:
                    cell.value = TRANSLATIONS[v]
                    print(f'  [{sn}] {repr(v[:50])} → {repr(TRANSLATIONS[v][:50])}')
                    changed += 1

wb.save('TAS-Tables.xlsx')
print(f'\nDone. {changed} cells translated. Saved TAS-Tables.xlsx')
