"""
fill_tables.py — Convert //table markers in TAS7.docx into proper Word tables
and export all table data to TAS7-tables.xlsx.

Strategy:
- Find every paragraph whose text contains '//table' (8 markers found).
- For markers that already have pipe-delimited text below them, parse that text.
- For markers that need data from code analysis (Req table, Rate Limiting),
  use hardcoded data extracted from the real auth-app source.
- Insert a formatted Word table, delete the original pipe-text paragraphs.
- Export all tables to TAS7-tables.xlsx (one sheet per table).

Usage:  python Final-Final/fill_tables.py
Output: Final-Final/TAS7-updated.docx
        Final-Final/TAS7-tables.xlsx
"""

import re
import sys
from pathlib import Path

from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

BASE = Path(__file__).parent

# ─────────────────────────────────────────────────────────────────────────────
# Hardcoded table data (for markers without existing pipe-text in document)
# ─────────────────────────────────────────────────────────────────────────────

# Marker 0 — ตารางที่ 3.5 Functional & Non-Functional Requirements
# (source: auth-app codebase analysis)
REQ_HEADERS = ["หมายเลข", "ประเภท", "ความต้องการ", "สถานะ"]
REQ_ROWS = [
    ["FR01", "Functional", "ระบบต้องรองรับการลงทะเบียนผู้ใช้พร้อมบันทึก PDPA consent", "✓ ดำเนินการแล้ว"],
    ["FR02", "Functional", "ระบบต้องรองรับการเข้าสู่ระบบด้วย Email และ Password", "✓ ดำเนินการแล้ว"],
    ["FR03", "Functional", "ระบบต้องรองรับ Social Login ผ่าน Google และ GitHub", "✓ ดำเนินการแล้ว"],
    ["FR04", "Functional", "ระบบต้องรองรับการจัดการ Session หลายอุปกรณ์พร้อมกัน", "✓ ดำเนินการแล้ว"],
    ["FR05", "Functional", "ระบบต้องรองรับ OAuth 2.0 Authorization Code Flow พร้อม PKCE (S256)", "✓ ดำเนินการแล้ว"],
    ["FR06", "Functional", "ระบบต้องมี OpenID Connect Discovery endpoint (/.well-known/openid-configuration)", "✓ ดำเนินการแล้ว"],
    ["FR07", "Functional", "ระบบต้องรองรับการรีเซ็ตรหัสผ่านผ่านอีเมล", "✓ ดำเนินการแล้ว"],
    ["FR08", "Functional", "ระบบต้องมีการยืนยันอีเมลก่อนเข้าใช้งาน", "✓ ดำเนินการแล้ว"],
    ["FR09", "Functional", "ระบบต้องรองรับ Refresh Token Rotation (Token เก่าถูก Blacklist ทันที)", "✓ ดำเนินการแล้ว"],
    ["FR10", "Functional", "ระบบต้องมี Admin Dashboard พร้อม Analytics, Logs และ Monitoring", "✓ ดำเนินการแล้ว"],
    ["FR11", "Functional", "ระบบต้องรองรับ Token Introspection และ Token Revocation", "✓ ดำเนินการแล้ว"],
    ["FR12", "Functional", "ระบบต้องรองรับการ Export ข้อมูลผู้ใช้ (PDPA Data Portability)", "✓ ดำเนินการแล้ว"],
    ["NFR01", "Non-Functional", "ระบบต้องใช้ bcrypt 10 rounds สำหรับการเข้ารหัสรหัสผ่าน", "✓ ดำเนินการแล้ว"],
    ["NFR02", "Non-Functional", "JWT Access Token มีอายุ 1 ชั่วโมง, Refresh Token มีอายุ 30 วัน", "✓ ดำเนินการแล้ว"],
    ["NFR03", "Non-Functional", "ระบบต้องรองรับการ Deploy ด้วย Docker และ Docker Compose", "✓ ดำเนินการแล้ว"],
    ["NFR04", "Non-Functional", "ระบบต้องมี Rate Limiting โดยใช้ Redis เป็น store", "✓ ดำเนินการแล้ว"],
    ["NFR05", "Non-Functional", "ระบบต้องใช้ Security Headers (Helmet.js, HSTS, CSP, CORS)", "✓ ดำเนินการแล้ว"],
    ["NFR06", "Non-Functional", "Session มีอายุสูงสุดไม่เกิน 90 วัน", "✓ ดำเนินการแล้ว"],
    ["NFR07", "Non-Functional", "ขนาด Request Body จำกัดไม่เกิน 10 KB", "✓ ดำเนินการแล้ว"],
]

# Marker 1 — Rate Limiting per Endpoint  (source: rateLimiter.js exact values)
RL_HEADERS = ["Endpoint", "จำนวนสูงสุด (req)", "ช่วงเวลา", "วัตถุประสงค์"]
RL_ROWS = [
    ["/api/auth/login", "5", "15 นาที", "ป้องกัน Brute Force Login"],
    ["/api/auth/register", "3", "60 นาที", "ป้องกันการสร้างบัญชีสแปม"],
    ["/api/oauth/token", "10", "15 นาที", "ป้องกัน Token Request Abuse"],
    ["/api/auth/forgot-password", "5", "60 นาที", "ป้องกันการส่ง Password Reset Email สแปม"],
    ["/api/oauth/authorize", "30", "15 นาที", "ป้องกัน Authorization Request Flood"],
    ["/api/oauth/introspect", "20", "15 นาที", "ป้องกัน Token Introspection Abuse"],
    ["/api/oauth/revoke", "20", "15 นาที", "ป้องกัน Token Revoke Flood"],
    ["ทั่วไป (General)", "100", "15 นาที", "Default Rate Limit สำหรับ Endpoint ทั่วไป"],
]

RL_TIER_HEADERS = ["ระดับผู้ใช้ (Tier)", "จำนวนสูงสุด (req)", "ช่วงเวลา"]
RL_TIER_ROWS = [
    ["free", "100", "15 นาที"],
    ["authenticated", "500", "15 นาที"],
    ["premium", "2,000", "15 นาที"],
    ["admin", "10,000", "15 นาที"],
]

# ─────────────────────────────────────────────────────────────────────────────
# Word helpers
# ─────────────────────────────────────────────────────────────────────────────

HEADER_BG = "2E74B5"
TOTAL_BG   = "D6E4F7"


def _get_text(elem):
    """Extract full text from a w:p element."""
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    return "".join(t.text or "" for t in elem.iter(f"{{{ns}}}t"))


def set_cell_bg(cell, hex_color: str):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def make_word_table(doc: Document, headers: list, rows: list):
    """Create a formatted Word table and return it (NOT yet attached to doc body)."""
    tbl = doc.add_table(rows=1 + len(rows), cols=len(headers))
    try:
        tbl.style = "Table Grid"
    except KeyError:
        pass

    # Header row
    hdr_cells = tbl.rows[0].cells
    for i, text in enumerate(headers):
        hdr_cells[i].text = ""
        para = hdr_cells[i].paragraphs[0]
        run = para.add_run(text)
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.size = Pt(10)
        set_cell_bg(hdr_cells[i], HEADER_BG)

    # Data rows
    for r_i, row_data in enumerate(rows):
        cells = tbl.rows[r_i + 1].cells
        first_val = str(row_data[0]) if row_data else ""
        is_total = first_val.upper().startswith("TOTAL") or first_val.startswith("รวม")
        for c_i, val in enumerate(row_data):
            cells[c_i].text = ""
            para = cells[c_i].paragraphs[0]
            run = para.add_run(str(val))
            run.font.size = Pt(10)
            if is_total:
                run.bold = True
                set_cell_bg(cells[c_i], TOTAL_BG)

    return tbl


def insert_table_after(anchor_para, tbl):
    """Move tbl element to immediately after anchor_para element."""
    anchor_para._element.addnext(tbl._element)


def strip_table_comment(para):
    """Remove '//table' (case-insensitive) from all runs of a paragraph."""
    pat = re.compile(r"\s*//\s*table\s*", re.IGNORECASE)
    for run in para.runs:
        cleaned = pat.sub("", run.text)
        if cleaned != run.text:
            run.text = cleaned


def delete_element(elem):
    """Remove an XML element from its parent."""
    parent = elem.getparent()
    if parent is not None:
        parent.remove(elem)


# ─────────────────────────────────────────────────────────────────────────────
# Pipe-text parsing helpers
# ─────────────────────────────────────────────────────────────────────────────

def is_separator(text: str) -> bool:
    """True if the line is just dashes/pipes (a Markdown table separator)."""
    return bool(re.match(r"^[\s\-|+]+$", text))


def parse_pipe_row(text: str) -> list:
    """Split 'a | b | c' into ['a', 'b', 'c'], stripping whitespace."""
    return [c.strip() for c in text.split("|")]


def collect_pipe_data(marker_elem, body_children: list) -> tuple:
    """
    Starting from the body element AFTER marker_elem, collect consecutive
    paragraphs that contain '|'.  Returns:
        headers  — first parsed row
        rows     — remaining parsed rows (skip separator lines)
        elems    — elements to delete after table is inserted
    """
    start = body_children.index(marker_elem) + 1
    headers = []
    rows = []
    elems = []
    first = True
    blank_skipped = 0
    for elem in body_children[start:]:
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if tag != "p":
            break
        text = _get_text(elem).strip()
        if not text:
            # allow up to 2 blank paragraphs between marker and data
            if blank_skipped < 2:
                blank_skipped += 1
                continue
            break
        blank_skipped = 0
        if "|" not in text:
            break
        if is_separator(text):
            elems.append(elem)
            continue
        parts = parse_pipe_row(text)
        if first:
            headers = parts
            first = False
        else:
            rows.append(parts)
        elems.append(elem)
    return headers, rows, elems


# ─────────────────────────────────────────────────────────────────────────────
# Excel helpers
# ─────────────────────────────────────────────────────────────────────────────

HDR_FILL = PatternFill("solid", fgColor="2E74B5")
TOT_FILL = PatternFill("solid", fgColor="D6E4F7")
HDR_FONT = Font(bold=True, color="FFFFFF", size=11)
TOT_FONT = Font(bold=True, size=11)
NRM_FONT = Font(size=11)
_SIDE = Side(style="thin", color="000000")
BORDER = Border(left=_SIDE, right=_SIDE, top=_SIDE, bottom=_SIDE)


def xlsx_write_table(ws, title: str, headers: list, rows: list):
    ws.append([title])
    ws.cell(ws.max_row, 1).font = Font(bold=True, size=13)
    ws.append([])
    ws.append(headers)
    hrow = ws.max_row
    for col in range(1, len(headers) + 1):
        c = ws.cell(hrow, col)
        c.fill = HDR_FILL
        c.font = HDR_FONT
        c.alignment = Alignment(horizontal="center", wrap_text=True)
        c.border = BORDER
    for row_data in rows:
        ws.append(row_data)
        drow = ws.max_row
        fv = str(row_data[0]) if row_data else ""
        is_total = fv.upper().startswith("TOTAL") or fv.startswith("รวม")
        for col in range(1, len(row_data) + 1):
            c = ws.cell(drow, col)
            c.border = BORDER
            c.alignment = Alignment(wrap_text=True, vertical="top")
            c.fill = TOT_FILL if is_total else PatternFill()
            c.font = TOT_FONT if is_total else NRM_FONT
    for col_cells in ws.columns:
        maxlen = max((len(str(c.value or "")) for c in col_cells), default=0)
        ws.column_dimensions[col_cells[0].column_letter].width = min(maxlen + 4, 60)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    doc_in  = BASE / "TAS7.docx"
    doc_out = BASE / "TAS7-updated.docx"
    xlsx_out = BASE / "TAS7-tables.xlsx"

    print(f"Opening: {doc_in}")
    doc = Document(str(doc_in))
    body = doc.element.body

    # All direct body children (paragraphs, tables, etc.)
    body_children = list(body)

    # Find all paragraph elements whose text contains //table
    MARKER_RE = re.compile(r"//\s*table", re.IGNORECASE)
    marker_elems = [
        elem for elem in body_children
        if elem.tag.endswith("}p") and MARKER_RE.search(_get_text(elem))
    ]
    print(f"Found {len(marker_elems)} //table markers")

    # We'll collect (title, headers, rows) for Excel export
    excel_tables = []

    for idx, melem in enumerate(marker_elems):
        marker_text = _get_text(melem).strip()
        print(f"\n[{idx+1}] Marker: {marker_text[:80]!r}")

        # ── Choose table data ──────────────────────────────────────────────
        if idx == 0:
            # ตารางที่ 3.5 — Requirements (no pipe text in doc)
            all_sub = [
                ("ตารางที่ 3.5 — Functional & Non-Functional Requirements", REQ_HEADERS, REQ_ROWS)
            ]
            pipe_elems_to_delete = []

        elif idx == 1:
            # 3.8.1 Rate Limiting (no pipe text in doc, two sub-tables)
            all_sub = [
                ("Rate Limiting per Endpoint", RL_HEADERS, RL_ROWS),
                ("Rate Limiting Tiers", RL_TIER_HEADERS, RL_TIER_ROWS),
            ]
            pipe_elems_to_delete = []

        elif idx == 5:
            # ZAP — header IS in the marker paragraph itself ("ระดับ | จำนวน | รายละเอียด //table")
            # Parse header from marker, data from following paragraphs
            clean_marker = MARKER_RE.sub("", marker_text).strip()
            if "|" in clean_marker:
                headers_from_marker = parse_pipe_row(clean_marker)
                # Clear marker text (we'll use a label paragraph instead)
                for run in doc.paragraphs[
                    next(i for i, p in enumerate(doc.paragraphs)
                         if p._element is melem)
                ]._element.iter(
                    "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"
                ):
                    run.text = ""
            else:
                headers_from_marker = []

            # collect data rows after marker
            _, data_rows, pipe_elems_to_delete = collect_pipe_data(melem, body_children)
            if headers_from_marker:
                # Rewrite marker para text to just the label
                # (already cleared above; set it back to a simple label)
                # Actually find the label from the preceding paragraph
                midx_in_body = body_children.index(melem)
                label_text = "ตารางที่ 4.4 ผลการทดสอบความปลอดภัย OWASP ZAP Baseline Scan"
                all_sub = [(label_text, headers_from_marker, data_rows)]
            else:
                # fallback
                hdrs, rows, pipe_elems_to_delete = collect_pipe_data(melem, body_children)
                all_sub = [("OWASP ZAP", hdrs, rows)]

        else:
            # Generic: parse header from first pipe row after marker, data from rest
            hdrs, rows, pipe_elems_to_delete = collect_pipe_data(melem, body_children)
            label_map = {
                2: "ตารางที่ 3.2 — JWT Token Configuration",
                3: "ตารางที่ 4.X — สรุปผลการทดสอบระบบ TAS ทุกประเภท",
                4: "ตารางที่ 4.3 — k6 Load Test Results (Phase 2 Nginx Load Balancer)",
                6: "ตารางที่ 4.5 — Postman/Newman API Test Results",
                7: "ตารางที่ 4.6 — Playwright E2E Comprehensive Suite (Chromium)",
            }
            all_sub = [(label_map.get(idx, f"ตารางที่ {idx+1}"), hdrs, rows)]

        # ── Strip //table from marker paragraph ────────────────────────────
        # Find the python-docx Paragraph object for this element
        para_obj = None
        for p in doc.paragraphs:
            if p._element is melem:
                para_obj = p
                break
        if para_obj:
            strip_table_comment(para_obj)

        # ── Insert Word table(s) ───────────────────────────────────────────
        anchor = melem
        for title, headers, rows in all_sub:
            if not headers:
                print(f"  -> Skipping sub-table '{title}' (no headers)")
                continue
            print(f"  -> Inserting table: {title} ({len(rows)} rows)")
            tbl = make_word_table(doc, headers, rows)
            anchor.addnext(tbl._element)
            # Insert blank spacer paragraph after table so next sub-table
            # or content has proper separation
            spacer = OxmlElement("w:p")
            tbl._element.addnext(spacer)
            anchor = spacer
            excel_tables.append((title, headers, rows))

        # ── Delete original pipe-text paragraphs ──────────────────────────
        for elem in pipe_elems_to_delete:
            delete_element(elem)

        print(f"  -> Deleted {len(pipe_elems_to_delete)} pipe-text paragraphs")

    # ── Save .docx ────────────────────────────────────────────────────────
    doc.save(str(doc_out))
    print(f"\nSaved: {doc_out}")

    # ── Build Excel workbook ──────────────────────────────────────────────
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    sheet_names_seen = {}
    for title, headers, rows in excel_tables:
        # Sanitize sheet name: remove invalid chars, truncate to 31 chars
        sname = re.sub(r'[\\/*?\[\]:]', '-', title)[:28].strip()
        if sname in sheet_names_seen:
            sheet_names_seen[sname] += 1
            sname = f"{sname[:24]}_{sheet_names_seen[sname]}"
        else:
            sheet_names_seen[sname] = 0
        ws = wb.create_sheet(title=sname)
        xlsx_write_table(ws, title, headers, rows)

    wb.save(str(xlsx_out))
    print(f"Saved: {xlsx_out}")
    print(f"\nDone. {len(excel_tables)} tables created.")


if __name__ == "__main__":
    # Force UTF-8 output on Windows
    if sys.stdout.encoding.lower() != "utf-8":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    main()
