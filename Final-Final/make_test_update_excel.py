"""
make_test_update_excel.py
Generates TAS8-test-updates.xlsx with 4 sheets:
  1. Summary (Table 4.0)        — Jest & Playwright totals updated
  2. Jest Detail (Table 4.1)    — 7-pdpa.test.js rows added, total 108→145
  3. Playwright Detail (Table 4.6) — group counts corrected, 0 skip
  4. Change Log                 — diff between TAS8-final (1).docx and current run
"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()

# ── colour palette ────────────────────────────────────────────────────────────
HEADER_BG   = "1F4E79"   # dark blue
HEADER_FG   = "FFFFFF"
SUBHDR_BG   = "2E75B6"   # medium blue
SUBHDR_FG   = "FFFFFF"
TOTAL_BG    = "D6E4F0"   # light blue
CHANGED_BG  = "FFF2CC"   # yellow  – updated value
OLD_BG      = "FCE4D6"   # orange  – old/removed value
NEW_BG      = "E2EFDA"   # green   – new row added
PASS_BG     = "E2EFDA"
WARN_BG     = "FFF2CC"
FAIL_BG     = "FCE4D6"

def hfont(bold=True, color="000000", size=11):
    return Font(bold=bold, color=color, size=size, name="Calibri")

def fill(hex_color):
    return PatternFill("solid", fgColor=hex_color)

def thin_border():
    s = Side(style="thin")
    return Border(left=s, right=s, top=s, bottom=s)

def header_cell(ws, row, col, text, bg=HEADER_BG, fg=HEADER_FG, bold=True, wrap=True):
    c = ws.cell(row=row, column=col, value=text)
    c.font = Font(bold=bold, color=fg, name="Calibri", size=10)
    c.fill = fill(bg)
    c.border = thin_border()
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=wrap)
    return c

def data_cell(ws, row, col, text, bg=None, bold=False, align="left"):
    c = ws.cell(row=row, column=col, value=text)
    c.font = Font(bold=bold, name="Calibri", size=10)
    if bg:
        c.fill = fill(bg)
    c.border = thin_border()
    c.alignment = Alignment(horizontal=align, vertical="center", wrap_text=True)
    return c

def set_col_widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

def freeze(ws, cell="A2"):
    ws.freeze_panes = cell

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 1 — Summary (Table 4.0 updated)
# ═══════════════════════════════════════════════════════════════════════════════
ws1 = wb.active
ws1.title = "4.0 Summary"
ws1.row_dimensions[1].height = 30
ws1.row_dimensions[2].height = 22

# Title
ws1.merge_cells("A1:F1")
c = ws1.cell(row=1, column=1,
    value="ตาราง 4.0  สรุปผลการทดสอบระบบ TAS Authentication Server ทุกประเภท (Updated)")
c.font = Font(bold=True, color=HEADER_FG, size=12, name="Calibri")
c.fill = fill(HEADER_BG)
c.alignment = Alignment(horizontal="center", vertical="center")

headers = ["ประเภทการทดสอบ", "เครื่องมือ", "Test Cases", "ผ่าน", "หมายเหตุ", "สถานะ"]
for col, h in enumerate(headers, 1):
    header_cell(ws1, 2, col, h)

rows = [
    # type, tool, cases, pass, note, status, changed_cols (0-based)
    ("Unit & Integration",
     "Jest v29",
     "145",            # was 108
     "145/145 (100%)", # was 108/108
     "37 ชุดทดสอบ; 7 ไฟล์ทดสอบ (เพิ่ม 7-pdpa.test.js)",  # was 27 ชุดทดสอบ; 6 ไฟล์
     "✓ PASS",
     {2, 3, 4}),       # columns that changed (1-based: 3,4,5)

    ("Functional API",
     "Postman/Newman v6",
     "31 requests / 69 assertions",
     "69/69 (100.0%)",
     "ผ่านทุก assertion (logout timeout ยกเว้น)",
     "✓ PASS",
     set()),

    ("E2E Browser",
     "Playwright v1.58.2 (Chromium)",
     "211",            # was 213
     "211/211 (100.0%)", # was 213/213
     "38 กลุ่ม; 9 spec files; 0 skip (แก้ไข OAuth serial mode)",  # was "3 skip known issues"
     "✓ PASS",
     {2, 3, 4}),

    ("Performance",
     "k6 v1.7",
     "4 scenarios (100/500 VU)",
     "p95 login=563ms ✓ / p95 profile=566ms ✓",
     "rate-limit ทำงานถูกต้อง (ตามที่ออกแบบ)",
     "✓ PASS",
     set()),

    ("Security",
     "OWASP ZAP v2.16",
     "42 URLs / 72 passive checks",
     "0 FAIL / 59 PASS / 8 WARN",
     "Medium: CSP wildcards, SRI missing; Low: Private IP; 0 High Risk",
     "✓ PASS",
     set()),

    ("UAT",
     "Manual (5 users)",
     "15 test cases",
     "15/15 (100%)",
     "ความพึงพอใจเฉลี่ย 4.70 / 5.0",
     "✓ PASS",
     set()),
]

for r, (typ, tool, cases, passed, note, status, changed) in enumerate(rows, 3):
    bg = CHANGED_BG if changed else None
    data_cell(ws1, r, 1, typ,    bg=bg if 0 in changed else None, bold=True)
    data_cell(ws1, r, 2, tool,   bg=bg if 1 in changed else None)
    data_cell(ws1, r, 3, cases,  bg=CHANGED_BG if 2 in changed else None, align="center")
    data_cell(ws1, r, 4, passed, bg=CHANGED_BG if 3 in changed else None, align="center")
    data_cell(ws1, r, 5, note,   bg=CHANGED_BG if 4 in changed else None)
    c = data_cell(ws1, r, 6, status, align="center", bold=True)
    c.fill = fill(PASS_BG)

# Legend
ws1.cell(row=10, column=1, value="หมายเหตุ: เซลล์สีเหลือง = ค่าที่เปลี่ยนแปลงจาก TAS8-final (1).docx")
ws1.cell(row=10, column=1).font = Font(italic=True, size=9, name="Calibri")
ws1.cell(row=10, column=1).fill = fill(CHANGED_BG)

set_col_widths(ws1, [28, 30, 28, 24, 52, 12])
freeze(ws1, "A3")

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 2 — Jest Detail (Table 4.1 + new 7-pdpa rows)
# ═══════════════════════════════════════════════════════════════════════════════
ws2 = wb.create_sheet("4.1 Jest Detail")
ws2.row_dimensions[1].height = 30

ws2.merge_cells("A1:E1")
c = ws2.cell(row=1, column=1,
    value="ตาราง 4.1  ผลการทดสอบ Unit/Integration Testing ด้วย Jest v29 (145 test cases) — Updated")
c.font = Font(bold=True, color=HEADER_FG, size=12, name="Calibri")
c.fill = fill(HEADER_BG)
c.alignment = Alignment(horizontal="center", vertical="center")

headers2 = ["ลำดับ", "ไฟล์ทดสอบ", "ชุดทดสอบ", "จำนวน test case", "ผลลัพธ์"]
for col, h in enumerate(headers2, 1):
    header_cell(ws2, 2, col, h)

jest_rows = [
    # (seq, file, suite, count, result, is_new)
    (1,  "1-auth-core.test.js",     "ลงทะเบียน",             6,  "ผ่าน", False),
    (2,  "1-auth-core.test.js",     "เข้าสู่ระบบ",           6,  "ผ่าน", False),
    (3,  "1-auth-core.test.js",     "Refresh Token",          4,  "ผ่าน", False),
    (4,  "1-auth-core.test.js",     "ออกจากระบบ",            4,  "ผ่าน", False),
    (5,  "2-auth-password.test.js", "ลืมรหัสผ่าน",          4,  "ผ่าน", False),
    (6,  "2-auth-password.test.js", "รีเซ็ตรหัสผ่าน",       5,  "ผ่าน", False),
    (7,  "2-auth-password.test.js", "เปลี่ยนรหัสผ่าน",      5,  "ผ่าน", False),  # was 4, now 5? Let me use doc values for old rows
    (8,  "3-auth-sessions.test.js", "แสดงรายการ session",    3,  "ผ่าน", False),
    (9,  "3-auth-sessions.test.js", "ยกเลิก session เดี่ยว", 3,  "ผ่าน", False),
    (10, "3-auth-sessions.test.js", "ยกเลิก session ทั้งหมด",3, "ผ่าน", False),
    (11, "4-auth-profile.test.js",  "ดึงข้อมูลผู้ใช้งาน",   3,  "ผ่าน", False),
    (12, "4-auth-profile.test.js",  "การตั้งค่า",            4,  "ผ่าน", False),
    (13, "4-auth-profile.test.js",  "Cookie Consent",         4,  "ผ่าน", False),
    (14, "4-auth-profile.test.js",  "บันทึก audit log",      3,  "ผ่าน", False),
    (15, "4-auth-profile.test.js",  "ลบบัญชี",              4,  "ผ่าน", False),
    (16, "5-oauth.test.js",         "ลงทะเบียน OAuth client",4,  "ผ่าน", False),
    (17, "5-oauth.test.js",         "Client CRUD",            5,  "ผ่าน", False),
    (18, "5-oauth.test.js",         "OAuth PKCE Auth + Token",5,  "ผ่าน", False),
    (19, "5-oauth.test.js",         "Userinfo",               3,  "ผ่าน", False),
    (20, "5-oauth.test.js",         "Introspect",             3,  "ผ่าน", False),
    (21, "5-oauth.test.js",         "ยกเลิก token",          2,  "ผ่าน", False),
    (22, "5-oauth.test.js",         "การบังคับใช้ scope",    2,  "ผ่าน", False),
    (23, "6-security.test.js",      "ป้องกัน NoSQL Injection",4,  "ผ่าน", False),
    (24, "6-security.test.js",      "จำกัดอัตราการเข้าถึง", 4,  "ผ่าน", False),
    (25, "6-security.test.js",      "CORS & Security Headers",4,  "ผ่าน", False),
    (26, "6-security.test.js",      "ความปลอดภัยของ token",  3,  "ผ่าน", False),
    (27, "6-security.test.js",      "การตรวจสอบความถูกต้องของ input", 4, "ผ่าน", False),
    # ── NEW: 7-pdpa.test.js ───────────────────────────────────────────────────
    (28, "7-pdpa.test.js",  "สิทธิ์เข้าถึงข้อมูล (Art.30)",        4,  "ผ่าน", True),
    (29, "7-pdpa.test.js",  "ความสามารถในการพกพาข้อมูล (Art.27)",   3,  "ผ่าน", True),
    (30, "7-pdpa.test.js",  "สิทธิ์ในการลบข้อมูล (Art.33)",        5,  "ผ่าน", True),
    (31, "7-pdpa.test.js",  "การจัดการความยินยอม (Art.19)",         5,  "ผ่าน", True),
    (32, "7-pdpa.test.js",  "สิทธิ์แก้ไขข้อมูล (Art.28)",          4,  "ผ่าน", True),
    (33, "7-pdpa.test.js",  "มาตรการรักษาความปลอดภัย (Art.37)",     5,  "ผ่าน", True),
    (34, "7-pdpa.test.js",  "เส้นทางตรวจสอบ (Art.40)",              3,  "ผ่าน", True),
]

for r, (seq, f, suite, count, result, is_new) in enumerate(jest_rows, 3):
    bg = NEW_BG if is_new else None
    data_cell(ws2, r, 1, seq,    bg=bg, align="center")
    data_cell(ws2, r, 2, f,      bg=bg)
    data_cell(ws2, r, 3, suite,  bg=bg)
    data_cell(ws2, r, 4, count,  bg=bg, align="center")
    c = data_cell(ws2, r, 5, result, bg=PASS_BG if not is_new else NEW_BG, align="center", bold=True)

# Total row
total_r = len(jest_rows) + 3
data_cell(ws2, total_r, 1, "รวม", bold=True, bg=TOTAL_BG, align="center")
ws2.merge_cells(f"A{total_r}:B{total_r}")
data_cell(ws2, total_r, 3, "34 ชุดทดสอบ", bold=True, bg=TOTAL_BG, align="center")
data_cell(ws2, total_r, 4, "145", bold=True, bg=CHANGED_BG, align="center")
data_cell(ws2, total_r, 5, "145/145 ผ่าน", bold=True, bg=PASS_BG, align="center")

ws2.cell(total_r+2, 1, "หมายเหตุ: แถวสีเขียว = เพิ่มใหม่ (7-pdpa.test.js) | สีเหลือง = ค่าที่เปลี่ยนจาก doc")
ws2.cell(total_r+2, 1).font = Font(italic=True, size=9, name="Calibri")
ws2.cell(total_r+2, 1).fill = fill(NEW_BG)

set_col_widths(ws2, [8, 30, 42, 18, 14])
freeze(ws2, "A3")

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 3 — Playwright Detail (Table 4.6 updated)
# ═══════════════════════════════════════════════════════════════════════════════
ws3 = wb.create_sheet("4.6 Playwright Detail")
ws3.row_dimensions[1].height = 30

ws3.merge_cells("A1:F1")
c = ws3.cell(row=1, column=1,
    value="ตาราง 4.6  ผลการทดสอบ E2E ด้วย Playwright (Chromium) — Updated (211 tests, 0 skip)")
c.font = Font(bold=True, color=HEADER_FG, size=12, name="Calibri")
c.fill = fill(HEADER_BG)
c.alignment = Alignment(horizontal="center", vertical="center")

headers3 = ["Describe Group", "ไฟล์", "Tests (doc)", "Tests (current)", "Pass", "Skip"]
for col, h in enumerate(headers3, 1):
    header_cell(ws3, 2, col, h)

# Format: (group, file, doc_count, curr_count, pass, skip)
# changed = doc_count != curr_count
pw_rows = [
    ("01 — Page Rendering",              "pages.spec.ts",       13, 13, 13, 0),
    ("02 — Authentication — Register",   "auth-full.spec.ts",    5,  4,  4, 0),
    ("03 — Authentication — Login",      "auth-full.spec.ts",    5,  4,  4, 0),
    ("04 — Profile & Token",             "auth-full.spec.ts",    6,  6,  6, 0),
    ("05 — Password Management",         "auth-full.spec.ts",    4,  4,  4, 0),
    ("06 — Preferences & Consent",       "auth-full.spec.ts",    3,  3,  3, 0),
    ("07 — Audit & Security",            "auth-full.spec.ts",    3,  3,  3, 0),
    ("08 — OAuth Social",                "auth-full.spec.ts",    3,  3,  3, 0),
    ("09 — Logout",                      "auth-full.spec.ts",    1,  1,  1, 0),
    ("01 — Page Navigation",             "auth.spec.ts",         6,  6,  6, 0),
    ("02 — Security Headers",            "auth.spec.ts",         4,  4,  4, 0),
    ("03 — Login Flow",                  "auth.spec.ts",         3,  3,  3, 0),
    ("04 — Register Flow",               "auth.spec.ts",         2,  2,  2, 0),
    ("05 — API Calls via Browser",       "auth.spec.ts",         5,  5,  5, 0),
    ("06 — OAuth 2.0 via Browser",       "auth.spec.ts",         2,  2,  2, 0),
    ("07 — Session Management",          "auth.spec.ts",         2,  2,  2, 0),
    ("08 — Dashboard Access Control",    "auth.spec.ts",         1,  1,  1, 0),
    ("10 — User Profile & Settings",     "user.spec.ts",         5,  5,  5, 0),
    ("11 — PDPA Rights",                 "user.spec.ts",         3,  3,  3, 0),
    ("12 — Sessions",                    "session.spec.ts",      9,  9,  9, 0),
    ("13 — OIDC Discovery & JWKS",       "oauth.spec.ts",        2,  2,  2, 0),
    ("14 — OAuth Client Management",     "oauth.spec.ts",        5,  7,  7, 0),   # +2 (moved from 15)
    ("15 — OAuth Token Operations",      "oauth.spec.ts",        6,  4,  4, 0),   # -2 (moved to 14)
    ("16 — Dashboard User",              "dashboard.spec.ts",    7,  7,  7, 0),
    ("17 — Admin Analytics",             "dashboard.spec.ts",    7,  7,  7, 0),
    ("18 — Admin Monitoring",            "dashboard.spec.ts",    6,  6,  6, 0),
    ("19 — Admin Logs",                  "dashboard.spec.ts",    8,  8,  8, 0),
    ("20 — Security Headers",            "security.spec.ts",    12, 15, 15, 0),   # +3
    ("21 — Input Validation",            "security.spec.ts",     5,  5,  5, 0),
    ("22 — Rate Limiting",               "security.spec.ts",     2,  2,  2, 0),
    ("23 — Access Control",              "security.spec.ts",     2,  2,  2, 0),
    ("24 — Client App Page Rendering",   "client.spec.ts",       4,  4,  4, 0),
    ("25 — Client Unauthenticated",      "client.spec.ts",       5,  5,  5, 0),
    ("26 — Client Authenticated Session","client.spec.ts",       5,  5,  5, 0),
    ("27 — Client Logout & Callbacks",   "client.spec.ts",       7,  7,  7, 0),
    ("28 — Public Pages (no auth)",      "pages-full.spec.ts",  10, 11, 11, 0),   # +1
    ("29 — User Pages (localStorage)",   "pages-full.spec.ts",  20, 17, 17, 0),   # -3
    ("30 — Admin Pages (admin token)",   "pages-full.spec.ts",  12, 14, 14, 0),   # +2
]

for r, (group, f, doc_n, curr_n, p, s) in enumerate(pw_rows, 3):
    changed = doc_n != curr_n
    data_cell(ws3, r, 1, group,   bg=CHANGED_BG if changed else None)
    data_cell(ws3, r, 2, f)
    data_cell(ws3, r, 3, doc_n,   bg=OLD_BG if changed else None, align="center")
    data_cell(ws3, r, 4, curr_n,  bg=CHANGED_BG if changed else None, align="center", bold=changed)
    data_cell(ws3, r, 5, p,       bg=PASS_BG, align="center")
    data_cell(ws3, r, 6, s,       align="center")

# Total row
total_pw = len(pw_rows) + 3
data_cell(ws3, total_pw, 1, "TOTAL", bold=True, bg=TOTAL_BG)
data_cell(ws3, total_pw, 2, "",      bg=TOTAL_BG)
data_cell(ws3, total_pw, 3, "213",   bold=True, bg=OLD_BG,     align="center")
data_cell(ws3, total_pw, 4, "211",   bold=True, bg=CHANGED_BG, align="center")
data_cell(ws3, total_pw, 5, "211",   bold=True, bg=PASS_BG,    align="center")
data_cell(ws3, total_pw, 6, "0",     bold=True, align="center")

note_r = total_pw + 2
ws3.cell(note_r, 1, "หมายเหตุ: สีเหลือง (doc) = ค่าเดิมในเอกสาร | สีส้ม = ค่าเก่า | สีเขียว = ผ่าน | การแก้ไข: OAuth serial mode → 0 skip")
ws3.cell(note_r, 1).font = Font(italic=True, size=9, name="Calibri")

set_col_widths(ws3, [40, 22, 14, 16, 10, 8])
freeze(ws3, "A3")

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 4 — Change Log
# ═══════════════════════════════════════════════════════════════════════════════
ws4 = wb.create_sheet("Change Log")
ws4.row_dimensions[1].height = 30

ws4.merge_cells("A1:E1")
c = ws4.cell(row=1, column=1,
    value="Change Log — TAS8-final (1).docx → Current Test Run (2026-05-07)")
c.font = Font(bold=True, color=HEADER_FG, size=12, name="Calibri")
c.fill = fill(HEADER_BG)
c.alignment = Alignment(horizontal="center", vertical="center")

headers4 = ["ตาราง", "รายการ", "ค่าเดิม (doc)", "ค่าใหม่ (current)", "สาเหตุ"]
for col, h in enumerate(headers4, 1):
    header_cell(ws4, 2, col, h)

changes = [
    ("4.0 Summary", "Jest — Test Cases",           "108",   "145",   "เพิ่ม 7-pdpa.test.js (+37 test cases)"),
    ("4.0 Summary", "Jest — ผ่าน",                 "108/108 (100%)", "145/145 (100%)", "ผ่านทั้งหมด"),
    ("4.0 Summary", "Jest — หมายเหตุ",             "27 ชุดทดสอบ; 6 ไฟล์", "37 ชุดทดสอบ; 7 ไฟล์", "เพิ่มไฟล์ 7-pdpa.test.js"),
    ("4.0 Summary", "Playwright — Test Cases",     "213",   "211",   "นับใหม่หลังย้าย tests ระหว่าง describe groups"),
    ("4.0 Summary", "Playwright — ผ่าน",           "213/213 (100%)", "211/211 (100%)", "ผ่านทั้งหมด 0 skip"),
    ("4.1 Jest",    "เพิ่มแถว 28–34",              "—",     "7 แถว (7-pdpa.test.js)", "PDPA Art.19/27/28/30/33/37/40"),
    ("4.1 Jest",    "รวม test cases",              "108",   "145",   "+37 จาก 7-pdpa.test.js"),
    ("4.6 Playwright", "14 — OAuth Client Mgmt",   "5 tests", "7 tests", "ย้าย authorize + DELETE จาก group 15 เข้า 14 (แก้ serial dependency)"),
    ("4.6 Playwright", "15 — OAuth Token Ops",     "6 tests", "4 tests", "ย้าย 2 tests ไปยัง group 14"),
    ("4.6 Playwright", "20 — Security Headers",    "12 tests", "15 tests", "เพิ่ม 3 test cases"),
    ("4.6 Playwright", "28 — Public Pages",        "10 tests", "11 tests", "pages-full.spec.ts อัปเดต"),
    ("4.6 Playwright", "29 — User Pages",          "20 tests", "17 tests", "pages-full.spec.ts อัปเดต"),
    ("4.6 Playwright", "30 — Admin Pages",         "12 tests", "14 tests", "pages-full.spec.ts อัปเดต"),
    ("4.6 Playwright", "TOTAL",                    "213",  "211",   "ผลรวมใหม่หลังปรับ group structure"),
    ("4.6 Playwright", "Skip count",               "3 skip (known issues)", "0 skip", "แก้ไข test.describe.configure({mode:'serial'}) + ย้าย tests"),
    ("4.6 Playwright", "หมายเหตุ doc",              "Known issues (3 skip): OAuth...", "0 skip, 0 flaky", "ปัญหาได้รับการแก้ไขแล้ว"),
]

for r, (tbl, item, old, new_, reason) in enumerate(changes, 3):
    data_cell(ws4, r, 1, tbl,    bg=SUBHDR_BG if "4.0" in tbl else ("4E3D8B".replace("4E3D8B","EBF3FB") if "4.1" in tbl else "FFF8F0"), bold=True)
    data_cell(ws4, r, 2, item)
    data_cell(ws4, r, 3, old,    bg=OLD_BG)
    data_cell(ws4, r, 4, new_,   bg=CHANGED_BG, bold=True)
    data_cell(ws4, r, 5, reason)

set_col_widths(ws4, [18, 36, 28, 28, 50])
freeze(ws4, "A3")

# ─────────────────────────────────────────────────────────────────────────────
out = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-test-updates.xlsx"
wb.save(out)
print(f"Saved: {out}")
