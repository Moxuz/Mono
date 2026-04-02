"""
make_additions_excel.py — Export all fact-checked / newly added tables
from TAS7-final.docx into TAS7-additions.xlsx.

Sheets produced:
  1. OIDC Endpoints          — 7 corrected endpoints per spec
  2. PDPA Compliance         — 8 bullets (3 newly added)
  3. Auth Endpoints          — 17 auth endpoints from auth.routes.js
  4. Session Endpoints       — 5 session endpoints
  5. Social Login Endpoints  — 5 social/OAuth endpoints
  6. OAuth 2.0 Endpoints     — 11 OAuth 2.0 endpoints
  7. User Endpoints          — 10 user endpoints
  8. Dashboard Endpoints     — 35+ dashboard endpoints
  9. Test Results Summary    — 6 real test results (5.1 section)
 10. Fact-Check Log          — what was corrected and why
"""

from pathlib import Path
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

BASE = Path(__file__).parent
OUT  = BASE / "TAS7-additions.xlsx"

# ── Styles ─────────────────────────────────────────────────────────────────
HDR_FILL  = PatternFill("solid", fgColor="1F4E79")   # dark blue
SUB_FILL  = PatternFill("solid", fgColor="2E75B6")   # mid blue
NEW_FILL  = PatternFill("solid", fgColor="E2EFDA")   # light green  (newly added rows)
ALT_FILL  = PatternFill("solid", fgColor="DEEAF1")   # light blue   (alternate rows)
TOT_FILL  = PatternFill("solid", fgColor="FCE4D6")   # light orange (total/summary rows)
WHT_FILL  = PatternFill("solid", fgColor="FFFFFF")

HDR_FONT  = Font(bold=True, color="FFFFFF", size=11, name="Calibri")
SUB_FONT  = Font(bold=True, color="FFFFFF", size=10, name="Calibri")
TTL_FONT  = Font(bold=True, size=14, name="Calibri", color="1F4E79")
NRM_FONT  = Font(size=10, name="Calibri")
NEW_FONT  = Font(size=10, name="Calibri", color="375623")  # dark green for new items

_S   = Side(style="thin", color="BFBFBF")
_SB  = Side(style="medium", color="1F4E79")
BORDER     = Border(left=_S, right=_S, top=_S, bottom=_S)
BORDER_TOP = Border(left=_S, right=_S, top=_SB, bottom=_S)


def style_cell(cell, fill=None, font=None, bold=False, center=False, wrap=True):
    cell.border = BORDER
    cell.alignment = Alignment(wrap_text=wrap, vertical="top",
                                horizontal="center" if center else "left")
    if fill: cell.fill = fill
    if font: cell.font = font
    elif bold: cell.font = Font(bold=True, size=10, name="Calibri")
    else: cell.font = NRM_FONT


def write_sheet(wb, title: str, subtitle: str, headers: list, rows: list,
                new_rows: set = None, col_widths: list = None):
    """
    Write a formatted table to a new sheet.
    new_rows: set of 0-based row indices that are newly added (highlighted green).
    """
    ws = wb.create_sheet(title=title[:31])
    new_rows = new_rows or set()

    # Title row
    ws.merge_cells(start_row=1, start_column=1,
                   end_row=1,   end_column=len(headers))
    tc = ws.cell(1, 1, subtitle)
    tc.font = TTL_FONT
    tc.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 22

    # Header row
    for col, h in enumerate(headers, 1):
        c = ws.cell(2, col, h)
        c.fill = HDR_FILL
        c.font = HDR_FONT
        c.alignment = Alignment(horizontal="center", vertical="center",
                                 wrap_text=True)
        c.border = Border(left=_SB, right=_SB, top=_SB, bottom=_SB)
    ws.row_dimensions[2].height = 18

    # Data rows
    for r_idx, row in enumerate(rows):
        is_new   = r_idx in new_rows
        is_total = str(row[0]).upper().startswith("TOTAL") or str(row[0]).startswith("รวม")
        fill = (NEW_FILL if is_new else
                TOT_FILL if is_total else
                ALT_FILL if r_idx % 2 == 0 else WHT_FILL)
        font = (NEW_FONT if is_new else
                Font(bold=True, size=10, name="Calibri") if is_total else
                NRM_FONT)
        for col, val in enumerate(row, 1):
            c = ws.cell(r_idx + 3, col, val)
            c.fill = fill
            c.font = font
            c.border = BORDER
            c.alignment = Alignment(wrap_text=True, vertical="top")

    # Column widths
    if col_widths:
        for i, w in enumerate(col_widths, 1):
            ws.column_dimensions[
                openpyxl.utils.get_column_letter(i)].width = w
    else:
        # Auto-size (approximate)
        for col_cells in ws.columns:
            maxlen = max((len(str(c.value or "")) for c in col_cells), default=8)
            ws.column_dimensions[col_cells[0].column_letter].width = min(maxlen + 3, 55)

    return ws


# ── Table data ─────────────────────────────────────────────────────────────

OIDC_HEADERS = ["Method", "Path", "Description", "Spec Reference", "Status"]
OIDC_ROWS = [
    ["GET",  "/api/oauth/authorize",              "Authorization Endpoint",                   "OIDC Core 1.0 §3.1", "Required"],
    ["POST", "/api/oauth/token",                  "Token Endpoint",                            "OIDC Core 1.0 §3.1", "Required"],
    ["GET",  "/api/oauth/userinfo",               "UserInfo Endpoint — ดึง claims ด้วย Bearer token", "OIDC Core 1.0 §5.3", "Required"],
    ["POST", "/api/oauth/revoke",                 "Token Revocation Endpoint",                "RFC 7009",           "Implemented"],
    ["POST", "/api/oauth/introspect",             "Token Introspection Endpoint",             "RFC 7662",           "Implemented"],
    ["GET",  "/.well-known/openid-configuration", "OIDC Discovery Document",                  "RFC 8414",           "Implemented"],
    ["GET",  "/.well-known/jwks.json",            "JSON Web Key Set สำหรับตรวจสอบ signature", "RFC 7517",           "Implemented"],
]
# Previous doc had only 4 (was missing authorize, token; had wrong oauth-session)
OIDC_NEW = {0, 1, 3, 4}   # newly corrected rows

PDPA_HEADERS = ["#", "มาตรการ PDPA", "สิทธิ์ที่รองรับ", "Route / Implementation", "สถานะ"]
PDPA_ROWS = [
    ["1", "เก็บความยินยอม (Consent) จากผู้ใช้ในการเก็บและประมวลผลข้อมูล",
     "มาตรา 19 — Right to Consent",
     "POST /api/auth/register (consentEssential, consentAnalytics)",
     "✓ มีในระบบ"],
    ["2", "บันทึกเวลาที่ให้ความยินยอมและ IP address",
     "มาตรา 19 — Consent Audit",
     "User.pdpaConsent.essentialAcceptedAt, .consentIp",
     "✓ มีในระบบ"],
    ["3", "มีระบบลบข้อมูลผู้ใช้ (Right to Erasure)",
     "มาตรา 33 — Right to Erasure",
     "DELETE /api/auth/delete-account, DELETE /api/users/account",
     "✓ มีในระบบ"],
    ["4", "มีระบบบันทึกการเข้าถึงข้อมูล (Audit Log)",
     "มาตรา 37 — Audit Logging",
     "GET /api/auth/audit-logs, SecurityAudit model (17 event types)",
     "✓ มีในระบบ"],
    ["5", "เข้ารหัสรหัสผ่านด้วย bcrypt",
     "มาตรา 40 — Security Measures",
     "bcrypt 10 rounds (User.js pre-save hook)",
     "✓ มีในระบบ"],
    ["6", "มีระบบแก้ไขข้อมูล (Right to Rectification)",
     "มาตรา 28 — Right to Rectification",
     "PUT /api/users/profile",
     "✓ เพิ่มใหม่"],
    ["7", "มีระบบ Export ข้อมูลส่วนตัว (Right to Data Portability)",
     "มาตรา 27 — Right to Data Portability",
     "GET /api/users/export",
     "✓ เพิ่มใหม่"],
    ["8", "บันทึก Cookie Consent แยกประเภท (Essential / Analytics) พร้อม timestamp และ IP",
     "มาตรา 19 — Cookie Consent",
     "POST /api/auth/update-cookie-consent, User.pdpaConsent.cookieConsentAccepted",
     "✓ เพิ่มใหม่"],
]
PDPA_NEW = {5, 6, 7}   # rows newly added during fact-check

AUTH_HEADERS = ["Method", "Path", "Middleware", "คำอธิบาย"]
AUTH_ROWS = [
    ["POST",   "/api/auth/register",              "registerLimiter, validate",       "ลงทะเบียนผู้ใช้ใหม่ (PDPA consent required)"],
    ["POST",   "/api/auth/login",                 "loginLimiter, validate",          "เข้าสู่ระบบด้วย Email/Password"],
    ["POST",   "/api/auth/logout",                "generalLimiter, authenticate",    "ออกจากระบบ + blacklist token"],
    ["POST",   "/api/auth/refresh-token",         "tokenLimiter",                    "ต่ออายุ access token (Rotation)"],
    ["POST",   "/api/auth/validate-token",        "generalLimiter",                  "ตรวจสอบความถูกต้อง token"],
    ["GET",    "/api/auth/verify-email",          "generalLimiter",                  "ยืนยันอีเมล (click link)"],
    ["POST",   "/api/auth/resend-verification",   "forgotPasswordLimiter",           "ส่งอีเมลยืนยันใหม่"],
    ["POST",   "/api/auth/forgot-password",       "forgotPasswordLimiter, validate", "ขอรหัสผ่านใหม่"],
    ["POST",   "/api/auth/reset-password/:token", "forgotPasswordLimiter, validate", "รีเซ็ตรหัสผ่านผ่าน token"],
    ["POST",   "/api/auth/change-password",       "authenticate, forgotLimiter",     "เปลี่ยนรหัสผ่าน (ต้อง login)"],
    ["GET",    "/api/auth/profile",               "authenticate",                    "ดูข้อมูลโปรไฟล์"],
    ["DELETE", "/api/auth/delete-account",        "authenticate, generalLimiter",    "ลบบัญชีผู้ใช้ (PDPA Right to Erasure)"],
    ["GET",    "/api/auth/preferences",           "authenticate",                    "ดูการตั้งค่าผู้ใช้"],
    ["PUT",    "/api/auth/preferences",           "authenticate",                    "แก้ไขการตั้งค่าผู้ใช้"],
    ["POST",   "/api/auth/update-cookie-consent", "authenticate",                    "บันทึก Cookie Consent"],
    ["GET",    "/api/auth/audit-logs",            "authenticate",                    "ดู audit logs"],
    ["GET",    "/api/auth/security-audit",        "authenticate",                    "ดู security events"],
    ["POST",   "/api/auth/emergency-lockdown",    "authenticate, generalLimiter",    "ยกเลิกทุก sessions ฉุกเฉิน"],
    ["GET",    "/api/auth/oauth-session",         "(none)",                           "OAuth session bridge (post social login)"],
]

SESSION_HEADERS = ["Method", "Path", "Middleware", "คำอธิบาย"]
SESSION_ROWS = [
    ["GET",    "/api/auth/sessions",                    "authenticate",              "ดู active sessions ทั้งหมด"],
    ["GET",    "/api/auth/sessions/count",              "authenticate",              "จำนวน active sessions"],
    ["DELETE", "/api/auth/sessions/others/all",         "authenticate, requireSession", "ยกเลิก sessions อื่นทั้งหมด (คงไว้เฉพาะปัจจุบัน)"],
    ["DELETE", "/api/auth/sessions/all",                "authenticate",              "ยกเลิกทุก sessions (logout everywhere)"],
    ["DELETE", "/api/auth/sessions/:sessionId",         "authenticate",              "ยกเลิก session เฉพาะ ID"],
]

SOCIAL_HEADERS = ["Method", "Path", "Condition", "คำอธิบาย"]
SOCIAL_ROWS = [
    ["GET", "/api/auth/oauth/status",      "Always enabled",        "ตรวจสอบ providers ที่เปิดใช้งาน"],
    ["GET", "/api/auth/google",            "GOOGLE_ENABLED=true",   "เริ่ม Google OAuth"],
    ["GET", "/api/auth/google/callback",   "GOOGLE_ENABLED=true",   "Google OAuth callback"],
    ["GET", "/api/auth/github",            "GITHUB_ENABLED=true",   "เริ่ม GitHub OAuth"],
    ["GET", "/api/auth/github/callback",   "GITHUB_ENABLED=true",   "GitHub OAuth callback"],
]

OAUTH_HEADERS = ["Method", "Path", "Rate Limiter", "Auth Required", "คำอธิบาย"]
OAUTH_ROWS = [
    ["GET",    "/api/oauth/authorize",    "authorizeLimiter",   "No",  "แสดงหน้า Authorization (Consent)"],
    ["POST",   "/api/oauth/authorize",    "authorizeLimiter",   "No",  "อนุมัติ/ปฏิเสธ Authorization Request"],
    ["POST",   "/api/oauth/token",        "tokenLimiter",       "No",  "แลก code เป็น access token (PKCE S256)"],
    ["GET",    "/api/oauth/userinfo",     "generalLimiter",     "Bearer Token", "ดึง user claims"],
    ["POST",   "/api/oauth/introspect",   "introspectLimiter",  "Client Creds", "ตรวจสอบ token status"],
    ["POST",   "/api/oauth/revoke",       "revokeLimiter",      "authenticate", "ยกเลิก token"],
    ["POST",   "/api/oauth/clients",      "—",                  "authenticate", "ลงทะเบียน OAuth Client ใหม่"],
    ["GET",    "/api/oauth/clients",      "—",                  "authenticate", "ดู OAuth Clients ของตนเอง"],
    ["GET",    "/api/oauth/clients/:id",  "—",                  "authenticate", "ดู OAuth Client เฉพาะ ID"],
    ["PUT",    "/api/oauth/clients/:id",  "—",                  "authenticate", "แก้ไข OAuth Client"],
    ["DELETE", "/api/oauth/clients/:id",  "—",                  "authenticate", "ลบ OAuth Client"],
]

USER_HEADERS = ["Method", "Path", "Auth", "คำอธิบาย"]
USER_ROWS = [
    ["GET",    "/api/users/me",       "authenticate",              "ดูข้อมูลผู้ใช้ปัจจุบัน"],
    ["GET",    "/api/users/profile",  "authenticate",              "ดูโปรไฟล์ (PDPA Right to Access)"],
    ["PUT",    "/api/users/profile",  "authenticate",              "แก้ไขโปรไฟล์ (PDPA Right to Rectification)"],
    ["DELETE", "/api/users/account",  "authenticate",              "ลบบัญชี (PDPA Right to Erasure)"],
    ["GET",    "/api/users/export",   "authenticate",              "Export ข้อมูล (PDPA Right to Portability)"],
    ["GET",    "/api/users/sessions", "authenticate",              "ดู sessions"],
    ["PUT",    "/api/users/:id",      "authenticate",              "แก้ไขผู้ใช้ (ตนเองหรือ admin)"],
    ["GET",    "/api/users/",         "authenticate, admin",       "ดูผู้ใช้ทั้งหมด (Admin + pagination)"],
    ["GET",    "/api/users/:id",      "authenticate, admin",       "ดูผู้ใช้เฉพาะ (Admin)"],
    ["DELETE", "/api/users/:id",      "authenticate, admin",       "ปิดใช้งานบัญชี (Admin)"],
]

DASH_HEADERS = ["Method", "Path", "Role Required", "คำอธิบาย"]
DASH_ROWS = [
    # Main
    ["GET", "/api/dashboard/",                 "admin/moderator", "Dashboard home / API info"],
    ["GET", "/api/dashboard/login-activity",   "authenticate",    "Login activity chart (7 days)"],
    # Logs
    ["GET", "/api/dashboard/logs/stats",           "admin",       "Dashboard statistics"],
    ["GET", "/api/dashboard/logs/security",        "admin",       "Security audit logs (paginated, filterable)"],
    ["GET", "/api/dashboard/logs/logins",          "admin",       "Login history"],
    ["GET", "/api/dashboard/logs/failed-logins",   "admin",       "Failed logins grouped by IP/email"],
    ["GET", "/api/dashboard/logs/sessions",        "admin",       "Active sessions"],
    ["GET", "/api/dashboard/logs/export",          "admin",       "Export security logs to CSV"],
    ["GET", "/api/dashboard/logs/user/:userId/activity", "admin", "User activity timeline (30 days)"],
    # Monitoring
    ["GET", "/api/dashboard/monitoring/realtime",  "admin",       "Real-time monitoring"],
    ["GET", "/api/dashboard/monitoring/health",    "admin",       "System health status"],
    ["GET", "/api/dashboard/monitoring/login-chart","admin",      "Login attempts chart (hourly, 24h)"],
    ["GET", "/api/dashboard/monitoring/security-events","admin",  "Security events timeline"],
    ["GET", "/api/dashboard/monitoring/metrics",   "admin",       "Metrics summary"],
    # Analytics
    ["GET", "/api/dashboard/analytics/users",      "admin",       "User statistics"],
    ["GET", "/api/dashboard/analytics/logins",     "admin",       "Login statistics"],
    ["GET", "/api/dashboard/analytics/security",   "admin",       "Security statistics"],
    ["GET", "/api/dashboard/analytics/api-stats",  "admin",       "API statistics"],
    ["GET", "/api/dashboard/analytics/activity",   "admin",       "Recent activity feed (paginated)"],
    ["GET", "/api/dashboard/analytics/geographic", "admin",       "Geographic distribution"],
    # Dashboard user
    ["GET",  "/api/dashboard/user/security-summary","authenticate","Security summary (2FA, logins, sessions)"],
    ["GET",  "/api/dashboard/user/activity",        "authenticate","Activity logs (paginated, 30 days)"],
    ["GET",  "/api/dashboard/user/sessions",        "authenticate","Active sessions"],
    ["POST", "/api/dashboard/user/sessions/:id/revoke","authenticate","Revoke specific session"],
    ["POST", "/api/dashboard/user/sessions/revoke-all","authenticate","Revoke all other sessions"],
    ["GET",  "/api/dashboard/user/login-history",   "authenticate","Login history (30 days)"],
    # Health
    ["GET",  "/api/dashboard/health/redis",         "authenticate","Redis health check"],
]

TEST_HEADERS = ["ประเภทการทดสอบ", "เครื่องมือ", "Test Cases", "ผ่าน", "อัตรา", "หมายเหตุ"]
TEST_ROWS = [
    ["Unit/Integration Testing", "Jest v29",
     "104 test cases",
     "104/104",
     "100%",
     "27 กลุ่มทดสอบ, 6 test files"],
    ["Functional API Testing", "Postman/Newman v6",
     "31 requests / 70 assertions",
     "69/70",
     "98.6%",
     "1 fail: logout 504 timeout (Nginx proxy_read_timeout) — known issue"],
    ["E2E Browser Testing", "Playwright v1.x (Chromium)",
     "186 test cases",
     "182/186",
     "97.8%",
     "4 skip: OAuth state dependency"],
    ["Performance Testing", "k6 v1.7 (Phase 2 Nginx)",
     "4 scenarios (Login 100/500 VU, Profile 100/500 VU)",
     "9,999 req / 3:45 min",
     "error 0.47%",
     "44.4 req/s combined; ip_hash pins to 1 instance from localhost"],
    ["Security Testing", "OWASP ZAP v2.16",
     "55 passive checks / 42 URLs",
     "55 PASS, 0 FAIL",
     "100% PASS",
     "4 Medium (CSP), 4 Low, 9 Informational"],
    ["UAT (User Acceptance)", "Manual (5 users)",
     "15 test cases",
     "15/15",
     "100%",
     "ความพึงพอใจเฉลี่ย 4.70 / 5.0"],
]

FACTCHECK_HEADERS = ["หัวข้อ", "ปัญหาที่พบ", "การแก้ไข", "แหล่งอ้างอิง"]
FACTCHECK_ROWS = [
    ["OIDC Endpoints (§2.7)",
     "รายการ 4 endpoints ไม่ครบ: ขาด Authorization + Token Endpoint (REQUIRED); มี /api/auth/oauth-session ที่ไม่ใช่ OIDC spec",
     "เปลี่ยนเป็น 7 endpoints ที่ถูกต้อง: authorize, token, userinfo, revoke, introspect, openid-configuration, jwks.json",
     "OIDC Core 1.0 §3.1; RFC 7009; RFC 7662; RFC 8414"],
    ["PDPA Compliance (§2.4)",
     "ขาด Right to Rectification, Right to Data Portability และ Cookie Consent tracking",
     "เพิ่ม 3 bullets ใหม่: PUT /api/users/profile, GET /api/users/export, Cookie Consent",
     "PDPA มาตรา 27 (Portability), 28 (Rectification), 19 (Consent)"],
    ["Section 5.1 Test Results",
     "ไม่มีตัวเลขผลการทดสอบจริง มีแค่ข้อความทั่วไป",
     "เพิ่ม 6 บรรทัดผลทดสอบจริง: Jest/Newman/Playwright/k6/ZAP/UAT พร้อมตัวเลขครบ",
     "newman-report.json, pages-full.spec.ts, git commit history"],
    ["Research Contributions (§5.4)",
     "ระบุ '116 test cases' ผิด",
     "แก้เป็น '104 test cases' (ตรงกับตารางที่ 4.1 — Jest v29)",
     "ตารางที่ 4.1 ในเอกสาร; test run output"],
    ["Auth Endpoints (§3.x)",
     "//fact check marker — ตรวจสอบแล้ว",
     "ยืนยันถูกต้อง: 19 endpoints ตรงกับ auth.routes.js ทั้งหมด",
     "/src/modules/auth/routes/auth.routes.js"],
    ["Security Features §3.8",
     "//fact check marker — ตรวจสอบแล้ว",
     "ยืนยันถูกต้อง: rate limits, lockout, CSRF, bcrypt ตรงกับ code",
     "/src/shared/middleware/rateLimiter.js, User.js"],
    ["Related Research §2.8",
     "//fact check marker — ตรวจสอบแล้ว",
     "ยืนยันถูกต้อง: Fett et al. (2016), Koponen (2016), Philippaerts (2022), JWT study (2023), Melton (2017)",
     "References [16]-[20] ในเอกสาร"],
    ["Comparison with Related Systems (§5)",
     "//fact check with real code — ตรวจสอบแล้ว",
     "ยืนยันถูกต้อง: Emergency Lockdown, Token Blacklisting, Apache Kafka audit logging มีจริงในระบบ",
     "auth.routes.js, TokenBlacklist.js, securityAudit.service.js"],
]

# ── Build workbook ──────────────────────────────────────────────────────────

def main():
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    write_sheet(wb, "1. OIDC Endpoints",
                "OIDC Endpoints ที่ระบบ implement (แก้ไขให้ครบตามสเปค OIDC Core 1.0)",
                OIDC_HEADERS, OIDC_ROWS, new_rows=OIDC_NEW,
                col_widths=[8, 36, 40, 14, 12])

    write_sheet(wb, "2. PDPA Compliance",
                "มาตรการ PDPA Compliance ทั้งหมด (สีเขียว = เพิ่มใหม่ระหว่าง fact-check)",
                PDPA_HEADERS, PDPA_ROWS, new_rows=PDPA_NEW,
                col_widths=[4, 48, 30, 48, 14])

    write_sheet(wb, "3. Auth Endpoints",
                "Authentication Endpoints ทั้งหมด (ตรวจสอบแล้วจาก auth.routes.js)",
                AUTH_HEADERS, AUTH_ROWS,
                col_widths=[9, 38, 32, 44])

    write_sheet(wb, "4. Session Endpoints",
                "Session Management Endpoints (session.routes.js)",
                SESSION_HEADERS, SESSION_ROWS,
                col_widths=[9, 38, 24, 44])

    write_sheet(wb, "5. Social Login Endpoints",
                "Social Login / OAuth Provider Endpoints (social.routes.js)",
                SOCIAL_HEADERS, SOCIAL_ROWS,
                col_widths=[9, 28, 22, 44])

    write_sheet(wb, "6. OAuth 2.0 Endpoints",
                "OAuth 2.0 Server Endpoints (oauth.routes.js)",
                OAUTH_HEADERS, OAUTH_ROWS,
                col_widths=[9, 28, 18, 16, 44])

    write_sheet(wb, "7. User Endpoints",
                "User Management Endpoints (user.routes.js)",
                USER_HEADERS, USER_ROWS,
                col_widths=[9, 24, 22, 52])

    write_sheet(wb, "8. Dashboard Endpoints",
                "Admin Dashboard Endpoints (dashboard + sub-routes)",
                DASH_HEADERS, DASH_ROWS,
                col_widths=[9, 46, 18, 44])

    write_sheet(wb, "9. Test Results Summary",
                "สรุปผลการทดสอบจริงทุกประเภท (Section 5.1 — updated from real test runs)",
                TEST_HEADERS, TEST_ROWS,
                col_widths=[26, 26, 34, 18, 10, 52])

    write_sheet(wb, "10. Fact-Check Log",
                "บันทึกการ Fact-Check และการแก้ไข (TAS7-final.docx)",
                FACTCHECK_HEADERS, FACTCHECK_ROWS,
                col_widths=[28, 52, 52, 40])

    wb.save(str(OUT))
    print(f"Saved: {OUT}")
    print(f"Sheets: {len(wb.sheetnames)}")
    for s in wb.sheetnames:
        print(f"  - {s}")


if __name__ == "__main__":
    main()
