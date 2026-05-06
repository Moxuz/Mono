import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

HEADER_BG = "1F4E79"; HEADER_FG = "FFFFFF"
CRIT_BG   = "FCE4D6"
CHANGED_BG= "FFF2CC"
NEW_BG    = "E2EFDA"
MINOR_BG  = "DEEAF1"
OK_BG     = "F2F2F2"
TOTAL_BG  = "D6E4F0"

def thin():
    s = Side(style="thin")
    return Border(left=s, right=s, top=s, bottom=s)

def fill(h):
    return PatternFill("solid", fgColor=h)

def hcell(ws, r, c, v, bg=HEADER_BG, fg=HEADER_FG):
    x = ws.cell(r, c, v)
    x.font = Font(bold=True, color=fg, size=10, name="Calibri")
    x.fill = fill(bg)
    x.border = thin()
    x.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

def dcell(ws, r, c, v, bg=None, bold=False, align="left"):
    x = ws.cell(r, c, v)
    x.font = Font(bold=bold, name="Calibri", size=10)
    if bg:
        x.fill = fill(bg)
    x.border = thin()
    x.alignment = Alignment(horizontal=align, vertical="center", wrap_text=True)
    return x

wb = openpyxl.load_workbook("TAS8-test-updates.xlsx")

ws = wb.create_sheet("Full Audit", 0)
ws.row_dimensions[1].height = 32
ws.row_dimensions[2].height = 22

ws.merge_cells("A1:G1")
c = ws.cell(1, 1, "TAS8-final (1).docx — Full Audit Report (2026-05-07) — All Issues Found")
c.font = Font(bold=True, color=HEADER_FG, size=12, name="Calibri")
c.fill = fill(HEADER_BG)
c.alignment = Alignment(horizontal="center", vertical="center")

hdrs = ["ID", "ตำแหน่ง (Para/Table)", "ข้อความปัจจุบันในเอกสาร", "ควรแก้เป็น", "ประเภท", "ระดับ", "สถานะ"]
for i, h in enumerate(hdrs, 1):
    hcell(ws, 2, i, h)

issues = [
    ("C-01a", "Para 921\n(Table 4.1 title)",
     "Jest v29 (108 test cases)",
     "Jest v29 (145 test cases)",
     "ตัวเลข", "CRITICAL", "ต้องแก้"),

    ("C-01b", "Para 1082\n(สรุปผลทดสอบ bullets)",
     "108 test cases, ผ่านครบ 108/108 (100%), 27 กลุ่มทดสอบ, 6 test files",
     "145 test cases, ผ่านครบ 145/145 (100%), 34 กลุ่มทดสอบ, 7 test files",
     "ตัวเลข", "CRITICAL", "ต้องแก้"),

    ("C-01c", "Para 1098\n(Academic Contribution)",
     "ผ่านครบ 108 test cases 100% ครอบคลุม 27 describe blocks ใน 6 test files",
     "145 test cases, 34 describe blocks, 7 test files",
     "ตัวเลข", "CRITICAL", "ต้องแก้"),

    ("C-01d", "Table 10, Row 1\n(Summary, Test Cases)",
     "108", "145",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-01e", "Table 10, Row 1\n(Summary, ผ่าน)",
     "108/108 (100%)", "145/145 (100%)",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-01f", "Table 10, Row 1\n(Summary, หมายเหตุ)",
     "27 กลุ่มทดสอบ; 6 ไฟล์ทดสอบ",
     "34 กลุ่มทดสอบ; 7 ไฟล์ทดสอบ",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-01g", "Table 11, แถว TOTAL\n(Jest, คอลัมน์ 2)",
     "27 กลุ่มทดสอบ", "34 กลุ่มทดสอบ",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-01h", "Table 11, แถว TOTAL\n(Jest, คอลัมน์ 3)",
     "108", "145",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-01i", "Table 11, แถว TOTAL\n(Jest, คอลัมน์ 4)",
     "108/108 ผ่าน", "145/145 ผ่าน",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("T-01", "Table 11\n(Jest, แถวที่ 29-35 — หายไป)",
     "— ไม่มีแถว (ตารางมีแค่ 27 แถว ครอบคลุม 6 ไฟล์)",
     "เพิ่ม 7 แถวสำหรับ 7-pdpa.test.js:\n"
     "28=สิทธิ์เข้าถึง Art.30 (4 tests)\n"
     "29=พกพาข้อมูล Art.27 (3 tests)\n"
     "30=สิทธิ์ลบ Art.33 (5 tests)\n"
     "31=ความยินยอม Art.19 (5 tests)\n"
     "32=แก้ไขข้อมูล Art.28 (4 tests)\n"
     "33=มาตรการความปลอดภัย Art.37 (5 tests)\n"
     "34=เส้นทางตรวจสอบ Art.40 (3 tests)",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-04a", "Para 1008\n(บทนำ Playwright section)",
     "ครอบคลุม 213 test cases (0 skip)",
     "211 test cases (0 skip)",
     "ตัวเลข", "CRITICAL", "ต้องแก้"),

    ("C-04b", "Para 1084\n(สรุปผลทดสอบ bullets)",
     "213 test cases, ผ่าน 213/213 (100.0%), 38 กลุ่ม, 0 skip",
     "211 test cases, ผ่าน 211/211 (100.0%), 38 กลุ่ม, 0 skip",
     "ตัวเลข", "CRITICAL", "ต้องแก้"),

    ("C-04c", "Table 10, Row 3\n(Summary, E2E, Test Cases)",
     "213", "211",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-04d", "Table 10, Row 3\n(Summary, E2E, ผ่าน)",
     "213/213 (100.0%)", "211/211 (100.0%)",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-04e", "Table 16, แถว TOTAL\n(Playwright, Tests)",
     "213", "211",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-04f", "Table 16, แถว TOTAL\n(Playwright, Pass)",
     "213", "211",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-05", "Para 1024\n(Known issues paragraph)",
     "- Known issues (3 skip): OAuth client GET/PUT/DELETE tests "
     "ต้องใช้ clientId จากการ register ก่อนหน้า (state dependency ระหว่าง test workers)",
     "ลบทิ้ง หรือแทนด้วย:\n"
     '"- แก้ไขแล้ว: เพิ่ม test.describe.configure({mode:serial}) '
     "และย้าย tests ทำให้ผ่าน 211/211 (0 skip)\"",
     "ย่อหน้า", "CRITICAL", "ต้องแก้"),

    ("C-06a", "Para 1086\n(สรุปผล ZAP bullet)",
     "5 Medium (CSP), 1 Low, 6 Informational",
     "5 Medium (CSP), 1 Low, 7 Informational",
     "ตัวเลข", "CRITICAL", "ต้องแก้"),

    ("C-06b", "Table 14, Row 3\n(ZAP, Informational, จำนวน)",
     "6", "7",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-07", "Table 10, Row 5\n(Summary, Security, หมายเหตุ)",
     "12 WARN (CSP, SRI, Private IP)",
     "8 WARN-NEW (5 Medium, 1 Low, 7 Informational)",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("T-02", "Table 16\n(Playwright, โครงสร้างตาราง)",
     "แถว TOTAL อยู่ที่ Row 28 แต่ยังมีแถว 29-31 (pages-full) ตามมา",
     "ย้ายแถว TOTAL ไปแถวสุดท้าย (หลัง Row 31) และอัปเดตเป็น 211",
     "โครงสร้าง", "CRITICAL", "ต้องแก้"),

    ("T-03", "Table 16\n(Playwright, describe groups)",
     "แสดง 30 กลุ่ม แต่อ้างว่า 38 กลุ่ม (ขาด 8 กลุ่มจาก auth.spec.ts)",
     "เพิ่มแถว: 01 Page Nav, 02 Security Headers, 03 Login Flow, "
     "04 Register Flow, 05 API via Browser, 06 OAuth via Browser, "
     "07 Session Mgmt, 08 Dashboard Access (รวม tests เหล่านี้ใน auth.spec.ts)",
     "โครงสร้าง", "CRITICAL", "ต้องแก้"),

    ("C-PW-14", "Table 16, Row 14\n(OAuth Client Mgmt, Tests)",
     "5", "7 (เพิ่ม authorize + DELETE จาก group 15)",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-PW-15", "Table 16, Row 15\n(OAuth Token Ops, Tests)",
     "6", "4 (ย้าย 2 tests ไปยัง group 14)",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-PW-20", "Table 16, Row 20\n(Security Headers, Tests)",
     "12", "15",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-PW-28", "Table 16, Row 29\n(28-Public Pages, Tests)",
     "10", "11",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-PW-29", "Table 16, Row 30\n(29-User Pages, Tests)",
     "20", "17",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("C-PW-30", "Table 16, Row 31\n(30-Admin Pages, Tests)",
     "12", "14",
     "ตาราง", "CRITICAL", "ต้องแก้"),

    ("OK-01", "Para 1083 (Newman/Postman)",
     "31 requests, 69 assertions, ผ่าน 69/69 (100.0%)",
     "ถูกต้องแล้ว — ไม่ต้องแก้",
     "ตัวเลข", "OK", "ถูกต้อง"),

    ("OK-02", "Table 15 (Newman detail, ทุกแถว)",
     "31 requests / 69 assertions / 69 pass / 0 fail",
     "ถูกต้องแล้ว — ไม่ต้องแก้",
     "ตาราง", "OK", "ถูกต้อง"),

    ("OK-03", "Table 14 (ZAP)\nMedium=5, Low=1, PASS=59",
     "Medium 5, Low 1, PASS 59",
     "ถูกต้องแล้ว (แก้เฉพาะ Informational 6→7)",
     "ตาราง", "OK", "ถูกต้อง"),

    ("OK-04", "Table 17 (UAT)\n15 cases",
     "15/15 (100%), ความพึงพอใจ 4.70/5.0",
     "ถูกต้องแล้ว — ไม่ต้องแก้",
     "ตาราง", "OK", "ถูกต้อง"),

    ("OK-05", "Table 13 (k6 Phase comparison)",
     "Profile P95 Phase2 = 5,450ms, Error 0.47%",
     "ถูกต้องแล้ว — ไม่ต้องแก้",
     "ตาราง", "OK", "ถูกต้อง"),
]

for r, (iid, loc, cur, should, typ, sev, status) in enumerate(issues, 3):
    ws.row_dimensions[r].height = 45
    is_crit = sev == "CRITICAL"
    is_ok   = sev == "OK"
    row_bg  = CRIT_BG if is_crit else (OK_BG if is_ok else MINOR_BG)

    dcell(ws, r, 1, iid,   bg=row_bg, bold=True, align="center")
    dcell(ws, r, 2, loc)
    dcell(ws, r, 3, cur,   bg=CRIT_BG if is_crit else (OK_BG if is_ok else None))
    dcell(ws, r, 4, should,bg=CHANGED_BG if is_crit else (OK_BG if is_ok else None), bold=is_crit)
    dcell(ws, r, 5, typ,   align="center")
    sev_bg = {"CRITICAL": "FCE4D6", "MINOR": "DEEAF1", "OK": "E2EFDA"}.get(sev, "F2F2F2")
    dcell(ws, r, 6, sev,   bg=sev_bg, bold=is_crit, align="center")
    sta_bg = {"ต้องแก้": "FCE4D6", "ถูกต้อง": "E2EFDA", "ตรวจสอบ": "FFF2CC"}.get(status, "F2F2F2")
    dcell(ws, r, 7, status, bg=sta_bg, align="center")

# summary
total_r = len(issues) + 4
n_crit  = sum(1 for x in issues if x[5] == "CRITICAL")
n_minor = sum(1 for x in issues if x[5] == "MINOR")
n_ok    = sum(1 for x in issues if x[5] == "OK")
ws.merge_cells(f"A{total_r}:G{total_r}")
c = ws.cell(total_r, 1,
    f"สรุป: CRITICAL {n_crit} รายการ (ต้องแก้ด่วน)  |  MINOR {n_minor} รายการ  |  OK/ถูกต้อง {n_ok} รายการ")
c.font = Font(bold=True, size=11, name="Calibri")
c.fill = fill(TOTAL_BG)
c.alignment = Alignment(horizontal="center", vertical="center")
c.border = thin()

ws.column_dimensions["A"].width = 12
ws.column_dimensions["B"].width = 28
ws.column_dimensions["C"].width = 45
ws.column_dimensions["D"].width = 52
ws.column_dimensions["E"].width = 14
ws.column_dimensions["F"].width = 12
ws.column_dimensions["G"].width = 14
ws.freeze_panes = "A3"

wb.save("TAS8-test-updates.xlsx")
n_total = len(issues)
print(f"Updated: TAS8-test-updates.xlsx")
print(f"Full Audit sheet: {n_total} issues ({n_crit} CRITICAL, {n_minor} MINOR, {n_ok} OK)")
print(f"Sheets: {[s.title for s in wb.worksheets]}")
