"""
TAS Thesis Presentation Generator — 24 slides covering all 5 chapters
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
import os

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.abspath(__file__))
PIC  = os.path.join(BASE, "picture")
OUT  = os.path.join(BASE, "TAS-Presentation-Final.pptx")

# ─── Brand colours ────────────────────────────────────────────────────────────
DARK_NAVY   = RGBColor(0x0D, 0x1B, 0x40)   # slide background / header
MID_BLUE    = RGBColor(0x1A, 0x4F, 0x9C)   # accent bars
LIGHT_BLUE  = RGBColor(0xD6, 0xE4, 0xF7)   # subtle fills
PURPLE      = RGBColor(0x6C, 0x3A, 0xA0)   # chapter label
GREEN       = RGBColor(0x1B, 0x87, 0x5E)   # positive/pass
RED         = RGBColor(0xC0, 0x39, 0x2B)   # fail
GOLD        = RGBColor(0xF0, 0xB9, 0x29)   # highlight
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT_GRAY  = RGBColor(0xF5, 0xF7, 0xFA)
DARK_GRAY   = RGBColor(0x2C, 0x3E, 0x50)
MID_GRAY    = RGBColor(0x7F, 0x8C, 0x8D)

W = Inches(13.33)   # widescreen width  (16:9)
H = Inches(7.5)     # widescreen height

prs = Presentation()
prs.slide_width  = W
prs.slide_height = H

BLANK = prs.slide_layouts[6]   # completely blank

# ══════════════════════════════════════════════════════════════════════════════
# Helper functions
# ══════════════════════════════════════════════════════════════════════════════

def add_rect(slide, x, y, w, h, fill, alpha=None):
    shape = slide.shapes.add_shape(1, x, y, w, h)      # MSO_SHAPE_TYPE.RECTANGLE
    shape.fill.solid(); shape.fill.fore_color.rgb = fill
    shape.line.fill.background()
    return shape

def add_text(slide, text, x, y, w, h, size=18, bold=False, color=WHITE,
             align=PP_ALIGN.LEFT, wrap=True, italic=False):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size  = Pt(size)
    run.font.bold  = bold
    run.font.italic = italic
    run.font.color.rgb = color
    return tb

def add_bullet_box(slide, items, x, y, w, h, size=16, color=DARK_GRAY,
                   bullet="•", title=None, title_color=MID_BLUE):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    first = True
    if title:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        r = p.add_run(); r.text = title
        r.font.size = Pt(size + 1); r.font.bold = True; r.font.color.rgb = title_color
        first = False
    for item in items:
        p = tf.add_paragraph() if not first else tf.paragraphs[0]
        first = False
        p.alignment = PP_ALIGN.LEFT
        p.space_before = Pt(3)
        r = p.add_run()
        if isinstance(item, tuple):
            r.text = f"{bullet} {item[0]}"
            r.font.bold = True
            r.font.size = Pt(size)
            r.font.color.rgb = color
            # sub-items
            for sub in item[1]:
                ps = tf.add_paragraph()
                ps.alignment = PP_ALIGN.LEFT
                rs = ps.add_run(); rs.text = f"    – {sub}"
                rs.font.size = Pt(size - 1); rs.font.color.rgb = MID_GRAY
        else:
            r.text = f"{bullet} {item}"
            r.font.size = Pt(size); r.font.color.rgb = color
    return tb

def add_image(slide, img_path, x, y, w, h=None):
    if not os.path.exists(img_path):
        return None
    if h:
        return slide.shapes.add_picture(img_path, x, y, w, h)
    return slide.shapes.add_picture(img_path, x, y, w)

def slide_background(slide, color=LIGHT_GRAY):
    add_rect(slide, 0, 0, W, H, color)

def header_bar(slide, chapter_label, title, subtitle=None):
    # top navy bar
    add_rect(slide, 0, 0, W, Inches(1.5), DARK_NAVY)
    # left accent strip
    add_rect(slide, 0, 0, Inches(0.12), Inches(1.5), GOLD)
    # chapter pill
    add_rect(slide, Inches(0.25), Inches(0.18), Inches(2.4), Inches(0.38), PURPLE)
    add_text(slide, chapter_label, Inches(0.28), Inches(0.18), Inches(2.36), Inches(0.38),
             size=11, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    # main title
    add_text(slide, title, Inches(0.25), Inches(0.6), Inches(12.5), Inches(0.75),
             size=28, bold=True, color=WHITE)
    if subtitle:
        add_text(slide, subtitle, Inches(0.25), Inches(1.22), Inches(12.5), Inches(0.25),
                 size=13, color=LIGHT_BLUE, italic=True)

def divider(slide, y=Inches(1.6), color=LIGHT_BLUE):
    add_rect(slide, Inches(0.25), y, Inches(12.83), Pt(1.5), color)

def stat_card(slide, x, y, w, h, value, label, val_color=MID_BLUE, bg=WHITE):
    add_rect(slide, x, y, w, h, bg)
    # thin top accent
    add_rect(slide, x, y, w, Pt(4), val_color)
    add_text(slide, value, x, y + Inches(0.12), w, Inches(0.55),
             size=30, bold=True, color=val_color, align=PP_ALIGN.CENTER)
    add_text(slide, label, x, y + Inches(0.65), w, Inches(0.45),
             size=12, color=DARK_GRAY, align=PP_ALIGN.CENTER)

def two_col(slide, left_items, right_items, left_title=None, right_title=None,
            y_start=Inches(1.7), size=15):
    mid = Inches(6.9)
    col_w = Inches(6.1)
    add_bullet_box(slide, left_items,  Inches(0.3), y_start, col_w, Inches(5.3),
                   size=size, color=DARK_GRAY, title=left_title)
    add_bullet_box(slide, right_items, mid,         y_start, col_w, Inches(5.3),
                   size=size, color=DARK_GRAY, title=right_title)
    # vertical divider
    add_rect(slide, mid - Inches(0.15), y_start, Pt(1), Inches(5.0), LIGHT_BLUE)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — TITLE
# ══════════════════════════════════════════════════════════════════════════════
def slide_title():
    sl = prs.slides.add_slide(BLANK)
    # full background
    add_rect(sl, 0, 0, W, H, DARK_NAVY)
    # decorative right panel
    add_rect(sl, Inches(9.2), 0, Inches(4.13), H, MID_BLUE)
    add_rect(sl, Inches(9.15), 0, Inches(0.12), H, GOLD)

    # logo area — TAS badge
    add_rect(sl, Inches(9.6), Inches(1.5), Inches(3.0), Inches(1.0), DARK_NAVY)
    add_text(sl, "TAS", Inches(9.6), Inches(1.5), Inches(3.0), Inches(0.85),
             size=56, bold=True, color=GOLD, align=PP_ALIGN.CENTER)
    add_text(sl, "Trusted Auth System", Inches(9.5), Inches(2.3), Inches(3.2), Inches(0.4),
             size=13, color=WHITE, align=PP_ALIGN.CENTER)

    # icons / tech row
    tech = ["Node.js", "MongoDB", "Redis", "OAuth 2.0", "Docker"]
    for i, t in enumerate(tech):
        add_rect(sl, Inches(9.45 + (i % 3)*0.98), Inches(3.2 + (i//3)*0.6), Inches(0.88), Inches(0.44), DARK_NAVY)
        add_text(sl, t, Inches(9.45 + (i % 3)*0.98), Inches(3.22 + (i//3)*0.6), Inches(0.88), Inches(0.4),
                 size=10, color=LIGHT_BLUE, align=PP_ALIGN.CENTER)

    # main title
    add_text(sl, "Trusted Authentication System", Inches(0.5), Inches(1.5), Inches(8.4), Inches(0.85),
             size=36, bold=True, color=WHITE)
    add_text(sl, "Using Monolithic Architecture",  Inches(0.5), Inches(2.3), Inches(8.4), Inches(0.7),
             size=32, bold=True, color=GOLD)

    add_rect(sl, Inches(0.5), Inches(3.15), Inches(4.5), Pt(2), GOLD)

    add_text(sl, "ระบบยืนยันตัวตนแบบเชื่อถือได้บนสถาปัตยกรรม Monolithic",
             Inches(0.5), Inches(3.3), Inches(8.4), Inches(0.5),
             size=15, color=LIGHT_BLUE, italic=True)

    add_text(sl, "นภัทร  มุนินิมิตร  (64050416)   |   ณัฐพล  วงศ์ไวยุทธ  (64050441)",
             Inches(0.5), Inches(4.1), Inches(8.4), Inches(0.4),
             size=13, color=WHITE)
    add_text(sl, "อาจารย์ที่ปรึกษา: ผศ.ดร.กฤษดา บุศรา",
             Inches(0.5), Inches(4.5), Inches(8.4), Inches(0.35),
             size=13, color=LIGHT_BLUE)
    add_text(sl, "สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง  |  ปีการศึกษา 2567",
             Inches(0.5), Inches(4.9), Inches(8.4), Inches(0.35),
             size=12, color=MID_GRAY)
    add_text(sl, "วิทยาการคอมพิวเตอร์  |  Bachelor of Science",
             Inches(0.5), Inches(5.25), Inches(8.4), Inches(0.35),
             size=12, color=MID_GRAY)

slide_title()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — TABLE OF CONTENTS
# ══════════════════════════════════════════════════════════════════════════════
def slide_toc():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    add_rect(sl, 0, 0, W, H, DARK_NAVY)

    add_text(sl, "สารบัญการนำเสนอ  /  Table of Contents",
             Inches(0.4), Inches(0.25), Inches(12.5), Inches(0.6),
             size=26, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    add_rect(sl, Inches(2.0), Inches(0.85), Inches(9.33), Pt(2), GOLD)

    chapters = [
        ("1", "บทนำ — Background & Introduction",           "Slides 3–4",   PURPLE),
        ("2", "ทฤษฎีที่เกี่ยวข้อง — Literature Review & Tech Stack", "Slides 5–7",   MID_BLUE),
        ("3", "วิธีดำเนินการวิจัย — Methodology & Architecture",    "Slides 8–14",  GREEN),
        ("4", "ผลการทดสอบ — Testing & Results",             "Slides 15–21", RGBColor(0xC0,0x7D,0x1B)),
        ("5", "สรุปผล — Conclusion & Future Work",          "Slides 22–24", RED),
    ]
    for i, (num, title, pages, col) in enumerate(chapters):
        y = Inches(1.15 + i * 1.12)
        add_rect(sl, Inches(0.4), y, Inches(12.53), Inches(0.95), RGBColor(0x1A, 0x2A, 0x50))
        add_rect(sl, Inches(0.4), y, Inches(0.07), Inches(0.95), col)
        add_rect(sl, Inches(0.5), y + Inches(0.12), Inches(0.6), Inches(0.7), col)
        add_text(sl, num, Inches(0.5), y + Inches(0.12), Inches(0.6), Inches(0.7),
                 size=22, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        add_text(sl, title, Inches(1.25), y + Inches(0.2), Inches(10.3), Inches(0.55),
                 size=17, bold=True, color=WHITE)
        add_text(sl, pages, Inches(11.8), y + Inches(0.25), Inches(1.0), Inches(0.45),
                 size=12, color=col, align=PP_ALIGN.RIGHT)

slide_toc()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — CH1: BACKGROUND & PROBLEM
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch1_background():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 1  •  บทนำ", "Background & Problem Statement", "ที่มาและความสำคัญของปัญหา")
    divider(sl)

    add_bullet_box(sl, [
        "ระบบยืนยันตัวตนมีความสำคัญต่อความปลอดภัยของข้อมูลในยุคดิจิทัล",
        "องค์กรส่วนใหญ่ใช้หลายระบบ Auth แยกกัน ทำให้บำรุงรักษายาก",
        "พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA 2562) กำหนดให้จัดการ consent และการเข้าถึงข้อมูลอย่างเป็นระบบ",
        "มาตรฐาน OAuth 2.0 + PKCE ยังขาดการ implement แบบ centralized ที่ครบถ้วนในระบบขนาดกลาง",
    ], Inches(0.3), Inches(1.7), Inches(6.4), Inches(4.5),
    size=15, color=DARK_GRAY, title="ปัญหาและที่มา (Problem Statement)", title_color=MID_BLUE)

    # right: pain points cards
    pains = [
        ("Multiple Auth Systems", "แต่ละ service ต้องจัดการ auth เอง"),
        ("PDPA Non-Compliance",   "ไม่มี consent tracking / audit log"),
        ("No Central Session Mgmt", "Logout หนึ่งที่ไม่ logout ทุกที่"),
        ("No OAuth 2.0 Server",   "ไม่รองรับ third-party client apps"),
    ]
    for i, (title, desc) in enumerate(pains):
        cx = Inches(7.0) + (i % 2) * Inches(3.1)
        cy = Inches(1.75) + (i // 2) * Inches(1.7)
        add_rect(sl, cx, cy, Inches(2.9), Inches(1.5), WHITE)
        add_rect(sl, cx, cy, Inches(2.9), Pt(4), RED)
        add_text(sl, title, cx + Inches(0.1), cy + Inches(0.08), Inches(2.7), Inches(0.45),
                 size=13, bold=True, color=DARK_GRAY)
        add_text(sl, desc,  cx + Inches(0.1), cy + Inches(0.5),  Inches(2.7), Inches(0.7),
                 size=12, color=MID_GRAY)

slide_ch1_background()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — CH1: OBJECTIVES & SCOPE
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch1_objectives():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 1  •  บทนำ", "Objectives & Scope", "วัตถุประสงค์และขอบเขต")
    divider(sl)

    two_col(sl,
        left_items=[
            "พัฒนาระบบยืนยันตัวตนแบบ Monolithic ที่ครบวงจร",
            "รองรับ OAuth 2.0 Authorization Code + PKCE",
            "รองรับ OpenID Connect (OIDC) สำหรับ SSO",
            "จัดการ Session หลายอุปกรณ์พร้อมกัน",
            "ปฏิบัติตาม PDPA 2562 ครบ 6 มาตรา",
            "ทดสอบประสิทธิภาพรองรับ 500 VU พร้อมกัน",
        ],
        right_items=[
            "Backend: Node.js + Express.js",
            "Database: MongoDB + Redis",
            "Auth: JWT + bcrypt + Passport.js",
            "Container: Docker + Nginx Load Balancer",
            "Logging: Apache Kafka",
            "3 instances + Redis session sharing",
            "Social Login: Google + GitHub",
        ],
        left_title="วัตถุประสงค์ (Objectives)",
        right_title="ขอบเขต (Scope)",
        size=14,
    )

    # benefit row
    benefits = ["Easy Maintenance", "Fast Deployment", "Centralized Auth", "PDPA Compliant", "Scalable"]
    bcolors  = [MID_BLUE, GREEN, PURPLE, GOLD, RGBColor(0xC0,0x7D,0x1B)]
    for i, (b, c) in enumerate(zip(benefits, bcolors)):
        x = Inches(0.3) + i * Inches(2.56)
        add_rect(sl, x, Inches(6.7), Inches(2.4), Inches(0.6), c)
        add_text(sl, b, x, Inches(6.7), Inches(2.4), Inches(0.6),
                 size=13, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

slide_ch1_objectives()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — CH2: RELATED WORK & STANDARDS
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch2_related():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 2  •  ทฤษฎีที่เกี่ยวข้อง", "Standards & Related Work", "มาตรฐานและงานวิจัยที่เกี่ยวข้อง")
    divider(sl)

    standards = [
        ("RFC 6749", "OAuth 2.0", "Authorization Framework"),
        ("RFC 7636", "PKCE",      "Proof Key for Code Exchange"),
        ("RFC 7519", "JWT",       "JSON Web Token Standard"),
        ("OpenID",   "OIDC",      "OpenID Connect Core 1.0"),
        ("RFC 8414", "OIDC Disc", "OAuth 2.0 Authorization Server Metadata"),
        ("OWASP",    "Security",  "Top 10 API Security Guidelines"),
    ]
    for i, (rfc, short, desc) in enumerate(standards):
        cx = Inches(0.3)  + (i % 3) * Inches(4.3)
        cy = Inches(1.75) + (i // 3) * Inches(1.4)
        add_rect(sl, cx, cy, Inches(4.1), Inches(1.25), WHITE)
        add_rect(sl, cx, cy, Inches(4.1), Pt(4), MID_BLUE)
        add_text(sl, rfc,   cx + Inches(0.08), cy + Inches(0.08), Inches(1.1), Inches(0.35),
                 size=10, color=MID_GRAY)
        add_text(sl, short, cx + Inches(0.08), cy + Inches(0.35), Inches(4.0), Inches(0.5),
                 size=20, bold=True, color=MID_BLUE)
        add_text(sl, desc,  cx + Inches(0.08), cy + Inches(0.82), Inches(4.0), Inches(0.38),
                 size=12, color=DARK_GRAY)

    add_bullet_box(sl, [
        "Monolithic Architecture: ง่ายต่อการพัฒนา debug และ deploy ในทีมขนาดเล็ก-กลาง",
        "เปรียบเทียบกับ Microservices: latency ต่ำกว่า, complexity น้อยกว่า สำหรับ auth layer",
        "PDPA 2562: กำหนดให้มี consent, audit trail, right to erasure, data portability",
    ], Inches(0.3), Inches(5.1), Inches(12.7), Inches(2.1),
    size=13, color=DARK_GRAY, title="แนวคิดที่เกี่ยวข้อง", title_color=MID_BLUE)

slide_ch2_related()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — CH2: TECHNOLOGY STACK
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch2_stack():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 2  •  ทฤษฎีที่เกี่ยวข้อง", "Technology Stack", "เทคโนโลยีที่ใช้ในการพัฒนา")
    divider(sl)

    cats = [
        ("Runtime",      ["Node.js v18+", "Express.js v4", "Passport.js"],       MID_BLUE),
        ("Database",     ["MongoDB v6", "Mongoose v8 ODM", "Redis v7 Cache"],    GREEN),
        ("Security",     ["JWT (HS256)", "bcrypt 10 rounds", "Helmet.js CSP"],   PURPLE),
        ("Auth",         ["OAuth 2.0 + PKCE", "OpenID Connect", "Google/GitHub OAuth"], GOLD),
        ("Infra",        ["Docker Compose", "Nginx Load Balancer", "3 App Instances"], RGBColor(0xC0,0x7D,0x1B)),
        ("Observability",["Apache Kafka v7.5", "Security Audit Log", "Admin Dashboard"], RED),
    ]
    for i, (cat, items, col) in enumerate(cats):
        cx = Inches(0.25) + (i % 3) * Inches(4.35)
        cy = Inches(1.7)  + (i // 3) * Inches(2.55)
        add_rect(sl, cx, cy, Inches(4.15), Inches(2.35), WHITE)
        add_rect(sl, cx, cy, Inches(4.15), Inches(0.45), col)
        add_text(sl, cat, cx, cy, Inches(4.15), Inches(0.45),
                 size=14, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        for j, item in enumerate(items):
            add_text(sl, f"  ▸  {item}",
                     cx + Inches(0.1), cy + Inches(0.52) + j * Inches(0.55),
                     Inches(3.9), Inches(0.5), size=13, color=DARK_GRAY)

slide_ch2_stack()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 7 — CH2: OAuth 2.0 + PKCE FLOW
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch2_oauth():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 2  •  ทฤษฎีที่เกี่ยวข้อง", "OAuth 2.0 + PKCE Authorization Code Flow",
               "ขั้นตอนการยืนยันตัวตนด้วย OAuth 2.0")
    divider(sl)

    # Flow steps
    steps = [
        ("1", "Client generates\ncode_verifier + challenge",   MID_BLUE),
        ("2", "Redirect to\n/api/oauth/authorize",            PURPLE),
        ("3", "User logs in\n& grants consent",               GREEN),
        ("4", "Auth code\nreturned to client",                GOLD),
        ("5", "POST /api/oauth/token\n+ code_verifier",       RGBColor(0xC0,0x7D,0x1B)),
        ("6", "Tokens issued:\naccess + id + refresh",        RED),
    ]
    for i, (num, desc, col) in enumerate(steps):
        x = Inches(0.3) + i * Inches(2.15)
        add_rect(sl, x, Inches(1.8), Inches(1.95), Inches(1.6), col)
        add_text(sl, num,  x, Inches(1.8),  Inches(1.95), Inches(0.55),
                 size=24, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        add_text(sl, desc, x, Inches(2.35), Inches(1.95), Inches(1.1),
                 size=11, color=WHITE, align=PP_ALIGN.CENTER)
        if i < 5:
            add_text(sl, "→", x + Inches(1.95), Inches(2.0), Inches(0.2), Inches(0.7),
                     size=20, bold=True, color=DARK_GRAY, align=PP_ALIGN.CENTER)

    two_col(sl,
        left_items=[
            "code_verifier: 32 random bytes (hex string)",
            "code_challenge: BASE64URL(SHA256(verifier))",
            "method: S256 only (plain rejected)",
            "code expires in 5 minutes",
            "One-time use: replay attack prevented",
        ],
        right_items=[
            "access_token: JWT 1h (sub, email, role, scope)",
            "id_token: JWT 1h (OIDC claims)",
            "refresh_token: JWT 30d (rotation enabled)",
            "Introspect: POST /api/oauth/introspect",
            "Revoke: POST /api/oauth/revoke",
        ],
        left_title="PKCE Security Details",
        right_title="Token Response",
        y_start=Inches(3.65), size=13,
    )

slide_ch2_oauth()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 8 — CH3: SYSTEM ARCHITECTURE OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch3_arch():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 3  •  วิธีดำเนินการ", "System Architecture Overview", "ภาพรวมสถาปัตยกรรมระบบ")
    divider(sl)

    # Architecture diagram using DFD Level 0
    img = os.path.join(PIC, "dfd-level0.png")
    if os.path.exists(img):
        add_image(sl, img, Inches(0.25), Inches(1.7), Inches(7.5), Inches(5.4))

    # right side labels
    layers = [
        ("Client Layer",   "Browser / OAuth Client App / Mobile",           MID_BLUE),
        ("Gateway Layer",  "Nginx Load Balancer → 3 App Instances",          PURPLE),
        ("App Layer",      "Node.js + Express + Passport.js",                GREEN),
        ("Data Layer",     "MongoDB (persistent) + Redis (cache/session)",   GOLD),
        ("Logging Layer",  "Apache Kafka + Security Audit DB",               RED),
        ("Admin Layer",    "Dashboard: Analytics / Logs / Monitoring",       RGBColor(0xC0,0x7D,0x1B)),
    ]
    for i, (name, desc, col) in enumerate(layers):
        y = Inches(1.75) + i * Inches(0.92)
        add_rect(sl, Inches(7.95), y, Inches(5.0), Inches(0.82), WHITE)
        add_rect(sl, Inches(7.95), y, Pt(5), Inches(0.82), col)
        add_text(sl, name, Inches(8.1),  y + Inches(0.04), Inches(4.7), Inches(0.35),
                 size=13, bold=True, color=col)
        add_text(sl, desc, Inches(8.1),  y + Inches(0.38), Inches(4.7), Inches(0.38),
                 size=11, color=MID_GRAY)

slide_ch3_arch()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 9 — CH3: DFD LEVEL 1 PROCESS DECOMPOSITION
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch3_dfd1():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 3  •  วิธีดำเนินการ", "Data Flow Diagram — Level 1", "การแยกย่อยกระบวนการหลัก 5 กระบวนการ")
    divider(sl)

    img = os.path.join(PIC, "dfd-level1.png")
    if os.path.exists(img):
        add_image(sl, img, Inches(0.25), Inches(1.65), Inches(7.8), Inches(5.55))

    processes = [
        ("P1", "User Authentication",    "register / login / logout / social login",  MID_BLUE),
        ("P2", "OAuth 2.0 Server",       "authorize / token / introspect / revoke",   PURPLE),
        ("P3", "Session & Token Mgmt",   "create / refresh / revoke tokens",          GREEN),
        ("P4", "User Profile Mgmt",      "CRUD / PDPA consent / preferences",         GOLD),
        ("P5", "Admin Dashboard",        "analytics / logs / monitoring",             RED),
    ]
    for i, (pid, name, desc, col) in enumerate(processes):
        y = Inches(1.75) + i * Inches(1.05)
        add_rect(sl, Inches(8.1), y, Inches(4.9), Inches(0.9), WHITE)
        add_rect(sl, Inches(8.1), y, Inches(0.55), Inches(0.9), col)
        add_text(sl, pid,  Inches(8.1),  y,              Inches(0.55), Inches(0.9),
                 size=16, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        add_text(sl, name, Inches(8.75), y + Inches(0.05), Inches(4.2), Inches(0.38),
                 size=13, bold=True, color=col)
        add_text(sl, desc, Inches(8.75), y + Inches(0.48), Inches(4.2), Inches(0.35),
                 size=11, color=MID_GRAY)

slide_ch3_dfd1()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 10 — CH3: USE CASE DIAGRAM
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch3_usecase():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 3  •  วิธีดำเนินการ", "Use Case Diagram", "กรณีการใช้งานระบบ")
    divider(sl)

    img = os.path.join(PIC, "usecase.png")
    if os.path.exists(img):
        add_image(sl, img, Inches(0.2), Inches(1.65), Inches(8.3), Inches(5.55))

    groups = [
        ("Account Mgmt",    ["Register", "Login (Local/Google/GitHub)", "Logout"],            MID_BLUE),
        ("Password",        ["Forgot", "Reset", "Change Password"],                           PURPLE),
        ("Profile & PDPA",  ["View/Update Profile", "Export Data", "Delete Account"],         GREEN),
        ("Session",         ["View Sessions", "Revoke Session", "Emergency Lockdown"],        GOLD),
        ("OAuth Server",    ["Consent", "Token Exchange", "Refresh", "Introspect", "Revoke"], RED),
        ("Admin",           ["User List", "Analytics", "Security Logs", "Monitoring"],        RGBColor(0xC0,0x7D,0x1B)),
    ]
    for i, (grp, cases, col) in enumerate(groups):
        y = Inches(1.7) + i * Inches(0.95)
        add_rect(sl, Inches(8.6), y, Inches(4.5), Inches(0.85), WHITE)
        add_rect(sl, Inches(8.6), y, Pt(5), Inches(0.85), col)
        add_text(sl, grp,  Inches(8.72), y + Inches(0.04), Inches(4.2), Inches(0.3),
                 size=12, bold=True, color=col)
        add_text(sl, "  ".join(f"• {c}" for c in cases),
                 Inches(8.72), y + Inches(0.38), Inches(4.25), Inches(0.42),
                 size=10, color=MID_GRAY)

slide_ch3_usecase()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 11 — CH3: SYSTEM MODULES & ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch3_modules():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 3  •  วิธีดำเนินการ", "System Modules & API Endpoints", "โมดูลระบบและ API ที่พัฒนา")
    divider(sl)

    modules = [
        ("Auth Module",    "POST /api/auth/register\nPOST /api/auth/login\nPOST /api/auth/logout\nPOST /api/auth/refresh-token\nPOST /api/auth/forgot-password\nPOST /api/auth/reset-password/:token\nPOST /api/auth/change-password", MID_BLUE),
        ("OAuth Module",   "GET /api/oauth/authorize\nPOST /api/oauth/authorize\nPOST /api/oauth/token\nGET /api/oauth/userinfo\nPOST /api/oauth/introspect\nPOST /api/oauth/revoke\nCRUD /api/oauth/clients", PURPLE),
        ("User Module",    "GET /api/users/me\nPUT /api/users/profile\nGET /api/auth/profile\nGET /api/auth/preferences\nPUT /api/auth/preferences\nDELETE /api/auth/delete-account\nGET /api/auth/audit-logs", GREEN),
        ("Session Module", "GET /api/sessions\nGET /api/sessions/count\nDELETE /api/sessions/:id\nPOST /api/auth/sessions/revoke\nPOST /api/auth/sessions/revoke-all-others\nPOST /api/auth/emergency-lockdown\n.well-known/openid-configuration", GOLD),
    ]
    for i, (mod, eps, col) in enumerate(modules):
        cx = Inches(0.25) + (i % 2) * Inches(6.5)
        cy = Inches(1.75) + (i // 2) * Inches(2.65)
        add_rect(sl, cx, cy, Inches(6.3), Inches(2.5), WHITE)
        add_rect(sl, cx, cy, Inches(6.3), Inches(0.42), col)
        add_text(sl, mod, cx, cy, Inches(6.3), Inches(0.42),
                 size=14, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        add_text(sl, eps, cx + Inches(0.1), cy + Inches(0.48), Inches(6.1), Inches(1.9),
                 size=10, color=DARK_GRAY)

    add_text(sl, "Total: 56 API endpoints across 4 main modules + Admin Dashboard",
             Inches(0.25), Inches(7.1), Inches(12.8), Inches(0.3),
             size=13, bold=True, color=MID_BLUE, align=PP_ALIGN.CENTER)

slide_ch3_modules()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 12 — CH3: ER DIAGRAM (DATA MODELS)
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch3_er():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 3  •  วิธีดำเนินการ", "Database Schema — ER Diagram", "โครงสร้างฐานข้อมูล MongoDB")
    divider(sl)

    img = os.path.join(PIC, "er.png")
    if os.path.exists(img):
        add_image(sl, img, Inches(0.2), Inches(1.65), Inches(7.8), Inches(5.55))

    models = [
        ("User",              "email, password(hashed), role, pdpaConsent, preferences, failedAttempts, lockUntil", MID_BLUE),
        ("Session",           "userId, sessionToken, refreshTokenHash, deviceInfo, ipAddress, TTL 90d",             PURPLE),
        ("TokenBlacklist",    "token, tokenType, userId, reason, expiresAt (auto-delete)",                         RED),
        ("AuthorizationCode", "code, clientId, userId, scope, code_challenge, expiresAt 5min, used",               GREEN),
        ("Client",            "client_id, client_secret(hashed), redirect_uris, grant_types, scope, owner",       GOLD),
        ("Consent",           "userId, clientId, scope, expiresAt 30d (PDPA)",                                     RGBColor(0xC0,0x7D,0x1B)),
        ("SecurityAudit",     "userId, action, status, ipAddress, metadata, TTL 90d",                              MID_GRAY),
    ]
    for i, (name, fields, col) in enumerate(models):
        y = Inches(1.72) + i * Inches(0.82)
        add_rect(sl, Inches(8.15), y, Inches(4.9), Inches(0.72), WHITE)
        add_rect(sl, Inches(8.15), y, Pt(4), Inches(0.72), col)
        add_text(sl, name,   Inches(8.25), y + Inches(0.03), Inches(1.5), Inches(0.3),
                 size=12, bold=True, color=col)
        add_text(sl, fields, Inches(8.25), y + Inches(0.33), Inches(4.7), Inches(0.36),
                 size=9,  color=MID_GRAY)

slide_ch3_er()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 13 — CH3: SECURITY FEATURES
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch3_security():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 3  •  วิธีดำเนินการ", "Security Features Implemented", "ฟีเจอร์ความปลอดภัยที่พัฒนา")
    divider(sl)

    features = [
        ("Rate Limiting", "Login: 5/15min (email+IP)\nRegister: 3/hr\nOAuth Token: 10/15min\nGeneral: 100/15min\nRedis-backed, memory fallback", MID_BLUE),
        ("Token Security", "JWT access token: 1h\nRefresh token: 30d (rotation)\nBlacklist on logout/revoke\nTheft detection → revoke all sessions", PURPLE),
        ("Account Protection", "bcrypt 10 rounds\nAccount lockout: 5 fails → 15min\nCSRF bypass for API routes\nInput validation + sanitization", GREEN),
        ("PKCE Enforcement", "S256 only (plain rejected)\nCode expires: 5 minutes\nOne-time use (replay prevented)\nCode verifier: 32 random bytes", GOLD),
        ("Security Headers", "X-Frame-Options: DENY\nX-Content-Type-Options: nosniff\nContent-Security-Policy (Helmet)\nHSTS (production)", RGBColor(0xC0,0x7D,0x1B)),
        ("Audit & PDPA", "Security event logging (Kafka)\nLogin/logout/password audit trail\nEmergency lockdown (all sessions)\nRight to erasure & data export", RED),
    ]
    for i, (title, desc, col) in enumerate(features):
        cx = Inches(0.25) + (i % 3) * Inches(4.33)
        cy = Inches(1.75) + (i // 3) * Inches(2.45)
        add_rect(sl, cx, cy, Inches(4.13), Inches(2.3), WHITE)
        add_rect(sl, cx, cy, Inches(4.13), Inches(0.42), col)
        add_text(sl, title, cx, cy, Inches(4.13), Inches(0.42),
                 size=14, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        add_text(sl, desc, cx + Inches(0.1), cy + Inches(0.5), Inches(3.9), Inches(1.7),
                 size=11, color=DARK_GRAY)

slide_ch3_security()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 14 — CH3: PDPA COMPLIANCE
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch3_pdpa():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 3  •  วิธีดำเนินการ", "PDPA Compliance Coverage", "การปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล 2562")
    divider(sl)

    sections = [
        ("มาตรา 19",  "Consent Management",   "จัดเก็บ consentEssential, consentAnalytics, cookieConsent\nพร้อม timestamp, IP address, policyVersion",  GREEN),
        ("มาตรา 27",  "Data Portability",      "GET /api/users/export — ส่งออกข้อมูลส่วนตัวทั้งหมด\nเป็น JSON (สิทธิ์การรับข้อมูลตาม PDPA)",            MID_BLUE),
        ("มาตรา 28",  "Data Rectification",    "PUT /api/users/profile — แก้ไข username, email\nGET/PUT /api/auth/preferences",                          PURPLE),
        ("มาตรา 33",  "Right to Erasure",      "DELETE /api/auth/delete-account — ทำ soft delete\nAnonymize email/username, revoke all sessions",         RED),
        ("มาตรา 37",  "Audit Logging",         "Security event log ทุก action\nGET /api/auth/audit-logs (90-day retention)",                              GOLD),
        ("มาตรา 40",  "Security Measures",     "bcrypt, JWT rotation, rate limiting, Helmet.js headers\nKafka distributed security logging",              RGBColor(0xC0,0x7D,0x1B)),
    ]
    for i, (sec, title, desc, col) in enumerate(sections):
        cx = Inches(0.25) + (i % 2) * Inches(6.5)
        cy = Inches(1.75) + (i // 2) * Inches(1.75)
        add_rect(sl, cx, cy, Inches(6.3), Inches(1.6), WHITE)
        add_rect(sl, cx, cy, Inches(1.0), Inches(1.6), col)
        add_text(sl, sec,   cx, cy + Inches(0.15), Inches(1.0), Inches(0.55),
                 size=13, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        add_text(sl, "✓",  cx, cy + Inches(0.85), Inches(1.0), Inches(0.5),
                 size=22, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        add_text(sl, title, cx + Inches(1.1), cy + Inches(0.1),  Inches(5.1), Inches(0.42),
                 size=14, bold=True, color=col)
        add_text(sl, desc,  cx + Inches(1.1), cy + Inches(0.55), Inches(5.1), Inches(0.95),
                 size=11, color=DARK_GRAY)

slide_ch3_pdpa()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 15 — CH4: TEST STRATEGY OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch4_strategy():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 4  •  ผลการทดสอบ", "Test Strategy Overview", "กลยุทธ์การทดสอบระบบ")
    divider(sl)

    rows = [
        ("Unit/Integration", "Jest v29",           "104",  "104",  "100%",   "6 files, 27 groups",               MID_BLUE),
        ("API Functional",   "Postman/Newman",      "31 req","69/69","98.6%", "6 groups, 1 timeout (logout)",     PURPLE),
        ("E2E Browser",      "Playwright v1.x",    "186",  "182",  "97.8%",  "4 skipped (state dependency)",     GREEN),
        ("Performance",      "k6 v1.7",            "4 scen","✓",   "44.4 r/s","100VU+500VU × login+profile",     GOLD),
        ("Security Scan",    "OWASP ZAP v2.16",    "55",   "55",   "0 FAIL", "12 WARN (CSP, dev env)",           RGBColor(0xC0,0x7D,0x1B)),
        ("UAT Manual",       "5 Users × 15 cases", "15",   "15",   "4.70/5", "Avg satisfaction 4.70/5.0",        RED),
    ]

    # header row
    headers = ["Test Type", "Tool", "Total", "Passed", "Result", "Notes"]
    widths   = [2.1, 1.85, 0.85, 0.85, 1.0, 4.1]
    hx = Inches(0.25)
    for j, (hdr, wd) in enumerate(zip(headers, widths)):
        add_rect(sl, hx, Inches(1.72), Inches(wd), Inches(0.42), DARK_NAVY)
        add_text(sl, hdr, hx, Inches(1.72), Inches(wd), Inches(0.42),
                 size=12, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        hx += Inches(wd)

    for i, (ttype, tool, total, passed, result, note, col) in enumerate(rows):
        y  = Inches(2.2) + i * Inches(0.78)
        bg = LIGHT_GRAY if i % 2 == 0 else WHITE
        rx = Inches(0.25)
        vals = [ttype, tool, total, passed, result, note]
        for j, (v, wd) in enumerate(zip(vals, widths)):
            add_rect(sl, rx, y, Inches(wd), Inches(0.72), bg)
            if j == 0:
                add_rect(sl, rx, y, Pt(4), Inches(0.72), col)
            fc = GREEN if j == 4 and "%" in v and float(v.replace("%","")) >= 97 else \
                 GOLD  if j == 4 else DARK_GRAY
            add_text(sl, v, rx + Pt(6), y, Inches(wd) - Pt(6), Inches(0.72),
                     size=11, color=fc, align=PP_ALIGN.CENTER if j >= 2 else PP_ALIGN.LEFT)
            rx += Inches(wd)

slide_ch4_strategy()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 16 — CH4: JEST UNIT/INTEGRATION RESULTS
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch4_jest():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 4  •  ผลการทดสอบ", "Unit & Integration Testing — Jest v29", "ผลการทดสอบหน่วยและการรวมระบบ")
    divider(sl)

    stat_card(sl, Inches(0.25), Inches(1.72), Inches(2.35), Inches(1.3), "104", "Total Test Cases",   MID_BLUE)
    stat_card(sl, Inches(2.7),  Inches(1.72), Inches(2.35), Inches(1.3), "104", "Passed",             GREEN)
    stat_card(sl, Inches(5.15), Inches(1.72), Inches(2.35), Inches(1.3), "0",   "Failed",             RED)
    stat_card(sl, Inches(7.6),  Inches(1.72), Inches(2.35), Inches(1.3), "100%","Pass Rate",          MID_BLUE)
    stat_card(sl, Inches(10.05),Inches(1.72), Inches(2.95), Inches(1.3), "27",  "Test Groups / 6 Files", PURPLE)

    suites = [
        ("1-auth-core.test.js",     "Register, Login, Logout, Token Operations",              "22 tests", GREEN),
        ("2-auth-password.test.js", "Change Password, Forgot Password, Reset Password",       "13 tests", GREEN),
        ("3-auth-sessions.test.js", "Get Sessions, Revoke, Emergency Lockdown",               "13 tests", GREEN),
        ("4-auth-profile.test.js",  "Profile, Preferences, Cookie Consent, Delete Account",  "19 tests", GREEN),
        ("5-oauth.test.js",         "Client CRUD, PKCE Auth Flow, Userinfo, Introspect, Revoke, Scope", "25 tests", GREEN),
        ("6-security.test.js",      "Account Lockout, Blacklisting, Session Theft, Injection, Headers", "12 tests", GREEN),
    ]
    for i, (fname, desc, count, col) in enumerate(suites):
        y = Inches(3.2) + i * Inches(0.67)
        add_rect(sl, Inches(0.25), y, Inches(12.8), Inches(0.6), WHITE if i%2==0 else LIGHT_GRAY)
        add_rect(sl, Inches(0.25), y, Pt(4), Inches(0.6), col)
        add_text(sl, f"✓  {fname}", Inches(0.38), y + Inches(0.05), Inches(7.5), Inches(0.28),
                 size=12, bold=True, color=GREEN)
        add_text(sl, desc, Inches(0.38), y + Inches(0.33), Inches(7.5), Inches(0.24),
                 size=10, color=MID_GRAY)
        add_text(sl, count, Inches(11.5), y + Inches(0.15), Inches(1.4), Inches(0.3),
                 size=13, bold=True, color=col, align=PP_ALIGN.RIGHT)

slide_ch4_jest()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 17 — CH4: NEWMAN API TEST RESULTS
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch4_newman():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 4  •  ผลการทดสอบ", "API Functional Testing — Postman / Newman", "ผลการทดสอบ API ด้วย Postman")
    divider(sl)

    stat_card(sl, Inches(0.25), Inches(1.72), Inches(2.55), Inches(1.2), "31",    "Requests",       MID_BLUE)
    stat_card(sl, Inches(2.9),  Inches(1.72), Inches(2.55), Inches(1.2), "69",    "Assertions Passed", GREEN)
    stat_card(sl, Inches(5.55), Inches(1.72), Inches(2.55), Inches(1.2), "0",     "Failed",         RED)
    stat_card(sl, Inches(8.2),  Inches(1.72), Inches(2.55), Inches(1.2), "98.6%", "Pass Rate",      MID_BLUE)
    stat_card(sl, Inches(10.85),Inches(1.72), Inches(2.2),  Inches(1.2), "1m 20s","Runtime",        PURPLE)

    groups = [
        ("00 — Health & Well-Known",       "GET /health (200, uptime), GET /.well-known/openid-configuration (RFC 8414)",       "4 assertions",  GREEN),
        ("01 — Authentication",            "Register (201), Login valid/invalid, Profile, Refresh, Forgot-Password, Logout",    "16 assertions", GREEN),
        ("02 — User Management",           "GET /users/me, PUT /users/profile, unauthenticated → 401",                          "8 assertions",  GREEN),
        ("03 — Sessions",                  "GET /sessions, POST revoke-all-others",                                             "6 assertions",  GREEN),
        ("04 — OAuth 2.0",                 "Client register/list, Introspect, Userinfo, Revoke token",                          "15 assertions", GREEN),
        ("05 — Security Headers & Rate",   "X-Frame-Options, X-Content-Type-Options, CSP, No X-Powered-By, 404 handling",       "10 assertions", GREEN),
        ("06 — Dashboard (Admin)",         "GET /dashboard/monitoring, /logs, /analytics → 401 without auth",                  "6 assertions",  GREEN),
    ]
    for i, (grp, desc, count, col) in enumerate(groups):
        y = Inches(3.1) + i * Inches(0.58)
        add_rect(sl, Inches(0.25), y, Inches(12.8), Inches(0.52), WHITE if i%2==0 else LIGHT_GRAY)
        add_rect(sl, Inches(0.25), y, Pt(4), Inches(0.52), col)
        add_text(sl, f"✓  {grp}", Inches(0.38), y + Inches(0.02), Inches(4.5), Inches(0.24),
                 size=11, bold=True, color=GREEN)
        add_text(sl, desc, Inches(0.38), y + Inches(0.27), Inches(9.8), Inches(0.22),
                 size=10, color=MID_GRAY)
        add_text(sl, count, Inches(11.5), y + Inches(0.1), Inches(1.4), Inches(0.28),
                 size=12, bold=True, color=col, align=PP_ALIGN.RIGHT)

slide_ch4_newman()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 18 — CH4: PLAYWRIGHT E2E RESULTS
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch4_playwright():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 4  •  ผลการทดสอบ", "E2E Browser Testing — Playwright v1.x", "ผลการทดสอบแบบ End-to-End ด้วย Playwright")
    divider(sl)

    stat_card(sl, Inches(0.25), Inches(1.72), Inches(2.55), Inches(1.2), "186",   "Total Tests",    MID_BLUE)
    stat_card(sl, Inches(2.9),  Inches(1.72), Inches(2.55), Inches(1.2), "182",   "Passed",         GREEN)
    stat_card(sl, Inches(5.55), Inches(1.72), Inches(2.55), Inches(1.2), "4",     "Skipped",        GOLD)
    stat_card(sl, Inches(8.2),  Inches(1.72), Inches(2.55), Inches(1.2), "97.8%", "Pass Rate",      MID_BLUE)
    stat_card(sl, Inches(10.85),Inches(1.72), Inches(2.2),  Inches(1.2), "30",    "Describe Groups", PURPLE)

    two_col(sl,
        left_items=[
            "02 — Register (valid/duplicate/missing consent)",
            "03 — Login (valid/wrong/missing)",
            "04 — Profile & Token (validate, refresh)",
            "05 — Reset Password (flow complete)",
            "06 — Forgot Password (email sent)",
            "08 — Security Headers (CSP, X-Frame etc.)",
            "09 — Rate Limiting (429 after limit)",
            "10 — Input Validation (XSS, NoSQL injection)",
            "11 — Session Management (list, revoke)",
            "14 — OAuth Client Register",
        ],
        right_items=[
            "15 — Token Introspect (active/inactive)",
            "16 — Token Revoke + verify blacklisted",
            "17 — Refresh Token Rotation",
            "18 — Emergency Lockdown",
            "19 — Admin Logs, Analytics, Monitoring",
            "20 — Preferences (theme, language)",
            "21 — Audit Log retrieval",
            "22 — Cookie Consent update",
            "24 — Client App Pages (OAuth flow)",
            "28–30 — Public/User/Admin Page Rendering",
        ],
        left_title="Test Groups (selected)",
        right_title="(continued)",
        y_start=Inches(3.05), size=12,
    )
    add_text(sl, "⚠ 4 skipped: state-dependent tests (depend on prior test context)",
             Inches(0.25), Inches(7.1), Inches(12.8), Inches(0.28),
             size=12, color=GOLD, align=PP_ALIGN.CENTER, italic=True)

slide_ch4_playwright()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 19 — CH4: K6 PERFORMANCE RESULTS
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch4_k6():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 4  •  ผลการทดสอบ", "Performance Load Testing — k6 v1.7", "ผลการทดสอบประสิทธิภาพด้วย k6")
    divider(sl)

    stat_card(sl, Inches(0.25), Inches(1.72), Inches(3.1), Inches(1.2), "44.4 r/s","Throughput (thesis)",        MID_BLUE)
    stat_card(sl, Inches(3.45), Inches(1.72), Inches(3.1), Inches(1.2), "0.47%",  "Error Rate (thesis)",         GREEN)
    stat_card(sl, Inches(6.65), Inches(1.72), Inches(3.1), Inches(1.2), "~896ms", "Profile avg (100VU)",         PURPLE)
    stat_card(sl, Inches(9.85), Inches(1.72), Inches(3.1), Inches(1.2), "9,999",  "Requests in 3:45 (thesis)",  GOLD)

    scenarios = [
        ("login_100vu",   "100 VUs",  "45s",  "POST /api/auth/login",     "p95 < 8000ms threshold"),
        ("profile_100vu", "100 VUs",  "45s",  "GET /api/auth/profile",    "p95 < 3000ms threshold"),
        ("login_500vu",   "500 VUs",  "60s",  "POST /api/auth/login",     "Rate limiter protection active"),
        ("profile_500vu", "500 VUs",  "60s",  "GET /api/auth/profile",    "Profile: avg ~982ms, p95 ~3.2s"),
    ]

    add_rect(sl, Inches(0.25), Inches(3.1), Inches(12.8), Inches(0.4), DARK_NAVY)
    for j, hdr in enumerate(["Scenario", "VUs", "Duration", "Endpoint", "Notes"]):
        x = [Inches(0.35), Inches(2.8), Inches(4.3), Inches(5.3), Inches(8.4)][j]
        add_text(sl, hdr, x, Inches(3.1), Inches(2.0), Inches(0.4),
                 size=12, bold=True, color=WHITE)

    for i, (name, vus, dur, ep, note) in enumerate(scenarios):
        y = Inches(3.6) + i * Inches(0.7)
        bg = LIGHT_GRAY if i % 2 == 0 else WHITE
        add_rect(sl, Inches(0.25), y, Inches(12.8), Inches(0.65), bg)
        col = GOLD if "500" in vus else MID_BLUE
        add_text(sl, name, Inches(0.35), y + Inches(0.08), Inches(2.3), Inches(0.5), size=13, bold=True, color=col)
        add_text(sl, vus,  Inches(2.8),  y + Inches(0.15), Inches(1.3), Inches(0.35), size=12, color=DARK_GRAY)
        add_text(sl, dur,  Inches(4.3),  y + Inches(0.15), Inches(0.9), Inches(0.35), size=12, color=DARK_GRAY)
        add_text(sl, ep,   Inches(5.3),  y + Inches(0.15), Inches(3.0), Inches(0.35), size=11, color=DARK_GRAY)
        add_text(sl, note, Inches(8.4),  y + Inches(0.15), Inches(4.5), Inches(0.35), size=11, color=MID_GRAY)

    add_text(sl, "✓ Architecture: Nginx + 3 App Instances + Redis shared session → horizontal scaling + automatic failover",
             Inches(0.25), Inches(6.7), Inches(12.8), Inches(0.3),
             size=12, bold=True, color=GREEN, align=PP_ALIGN.CENTER)

slide_ch4_k6()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 20 — CH4: OWASP ZAP SECURITY SCAN
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch4_zap():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 4  •  ผลการทดสอบ", "Security Testing — OWASP ZAP v2.16", "ผลการทดสอบความปลอดภัยด้วย OWASP ZAP Baseline Scan")
    divider(sl)

    stat_card(sl, Inches(0.25), Inches(1.72), Inches(3.0), Inches(1.3), "0",    "FAIL (Critical/High)",  GREEN)
    stat_card(sl, Inches(3.35), Inches(1.72), Inches(3.0), Inches(1.3), "55",   "PASS",                  GREEN)
    stat_card(sl, Inches(6.45), Inches(1.72), Inches(3.0), Inches(1.3), "12",   "WARN",                  GOLD)
    stat_card(sl, Inches(9.55), Inches(1.72), Inches(3.45),Inches(1.3), "42",   "URLs Scanned",          MID_BLUE)

    two_col(sl,
        left_items=[
            "✓ No SQL/NoSQL Injection vulnerabilities",
            "✓ No XSS (Cross-Site Scripting) vectors",
            "✓ No authentication bypass found",
            "✓ No sensitive data exposure",
            "✓ No broken access control",
            "✓ X-Frame-Options: DENY set",
            "✓ X-Content-Type-Options: nosniff set",
            "✓ No X-Powered-By header (server fingerprint removed)",
        ],
        right_items=[
            "⚠ Content-Security-Policy — script-src relaxed for dev",
            "⚠ Anti-CSRF token not detected on some forms",
            "⚠ Cookie without Secure flag (HTTP dev env)",
            "⚠ Permissions-Policy header missing",
            "",
            "ℹ Note: 12 WARNs are development-environment artifacts",
            "ℹ Production config: HTTPS + HSTS + strict CSP",
            "ℹ ZAP baseline scan: 5–8 min runtime via Docker",
        ],
        left_title="PASS Checks (55)",
        right_title="WARN Items (12) — dev only",
        y_start=Inches(3.1), size=13,
    )

slide_ch4_zap()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 21 — CH4: UAT RESULTS
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch4_uat():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 4  •  ผลการทดสอบ", "User Acceptance Testing (UAT)", "ผลการทดสอบการยอมรับจากผู้ใช้")
    divider(sl)

    stat_card(sl, Inches(0.25), Inches(1.72), Inches(2.55), Inches(1.2), "5",     "Testers",         MID_BLUE)
    stat_card(sl, Inches(2.9),  Inches(1.72), Inches(2.55), Inches(1.2), "15",    "Test Cases",      PURPLE)
    stat_card(sl, Inches(5.55), Inches(1.72), Inches(2.55), Inches(1.2), "15/15", "Passed",          GREEN)
    stat_card(sl, Inches(8.2),  Inches(1.72), Inches(2.55), Inches(1.2), "4.70",  "Avg Score /5.0",  GOLD)
    stat_card(sl, Inches(10.85),Inches(1.72), Inches(2.2),  Inches(1.2), "100%",  "Acceptance Rate", GREEN)

    criteria = [
        ("ความสอดคล้องกับข้อกำหนด",   "Requirement Compliance",  "4.70", MID_BLUE),
        ("ความถูกต้องของฟังก์ชัน",     "Functional Correctness",  "4.75", GREEN),
        ("ความง่ายในการใช้งาน",         "Ease of Use",             "4.65", PURPLE),
        ("ความปลอดภัย",                "Security",                "4.80", RED),
        ("ประสิทธิภาพ",                "Performance",             "4.60", GOLD),
    ]
    add_text(sl, "คะแนนความพึงพอใจแยกตามเกณฑ์ (5 คะแนน)",
             Inches(0.25), Inches(3.1), Inches(8.0), Inches(0.38),
             size=14, bold=True, color=MID_BLUE)
    for i, (th, en, score, col) in enumerate(criteria):
        y = Inches(3.55) + i * Inches(0.7)
        add_rect(sl, Inches(0.25), y, Inches(7.6), Inches(0.58), WHITE)
        add_text(sl, f"{th} ({en})", Inches(0.38), y + Inches(0.08), Inches(5.5), Inches(0.42),
                 size=13, color=DARK_GRAY)
        bar_w = float(score) / 5.0 * Inches(1.6)
        add_rect(sl, Inches(6.0), y + Inches(0.12), Inches(1.6), Inches(0.34), LIGHT_GRAY)
        add_rect(sl, Inches(6.0), y + Inches(0.12), bar_w,       Inches(0.34), col)
        add_text(sl, score, Inches(7.7), y + Inches(0.1), Inches(0.5), Inches(0.38),
                 size=14, bold=True, color=col)

    add_text(sl, "Overall Average:  4.70 / 5.0  →  ระดับดีมาก (Very Good)",
             Inches(0.25), Inches(7.05), Inches(8.0), Inches(0.35),
             size=15, bold=True, color=GREEN)

    # right side: test cases list
    add_bullet_box(sl, [
        "TC-01: Register with PDPA consent",
        "TC-02: Login & receive JWT",
        "TC-03: Refresh token rotation",
        "TC-04: View/update profile",
        "TC-05: Change password",
        "TC-06: Forgot/Reset password",
        "TC-07: Manage sessions",
        "TC-08: Emergency lockdown",
        "TC-09: OAuth client register",
        "TC-10: OAuth consent flow",
        "TC-11: Token introspect",
        "TC-12: Admin dashboard",
        "TC-13: Security audit logs",
        "TC-14: Export personal data",
        "TC-15: Delete account",
    ], Inches(8.4), Inches(1.75), Inches(4.6), Inches(5.6),
    size=11, color=DARK_GRAY, title="15 UAT Test Cases", title_color=PURPLE)

slide_ch4_uat()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 22 — CH5: RESULTS SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch5_summary():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 5  •  สรุปผล", "Results & Achievement Summary", "สรุปผลการดำเนินงานและความสำเร็จ")
    divider(sl)

    two_col(sl,
        left_items=[
            ("Functional Requirements (FR-01–FR-12)", [
                "FR-01: User Registration + PDPA consent ✓",
                "FR-02: Login (local + Google + GitHub) ✓",
                "FR-03: JWT + Refresh Token rotation ✓",
                "FR-04: Password management (forgot/reset/change) ✓",
                "FR-05: Multi-session management ✓",
                "FR-06: OAuth 2.0 + PKCE server ✓",
                "FR-07: OpenID Connect + OIDC Discovery ✓",
                "FR-08: PDPA consent + data export + erasure ✓",
                "FR-09: Security audit logging ✓",
                "FR-10: Admin dashboard ✓",
                "FR-11: Rate limiting + account lockout ✓",
                "FR-12: Emergency lockdown ✓",
            ]),
        ],
        right_items=[
            ("Non-Functional Requirements (NFR-01–NFR-07)", [
                "NFR-01: Performance — p95 < 1.2s at 100VU ✓",
                "NFR-02: Security — 0 Critical/High ZAP ✓",
                "NFR-03: Availability — 3 instance failover ✓",
                "NFR-04: Scalability — Nginx + Redis cluster ✓",
                "NFR-05: Maintainability — Monolithic, modular ✓",
                "NFR-06: PDPA compliance — 6 sections covered ✓",
                "NFR-07: Logging — Kafka + audit trail ✓",
            ]),
        ],
        y_start=Inches(1.75), size=13,
    )

slide_ch5_summary()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 23 — CH5: FUTURE WORK
# ══════════════════════════════════════════════════════════════════════════════
def slide_ch5_future():
    sl = prs.slides.add_slide(BLANK)
    slide_background(sl)
    header_bar(sl, "Chapter 5  •  สรุปผล", "Future Work & Recommendations", "งานวิจัยในอนาคตและข้อเสนอแนะ")
    divider(sl)

    areas = [
        ("🔐 Authentication Enhancements", [
            "Biometric (Fingerprint / Face Recognition)",
            "WebAuthn / FIDO2 Passwordless Login",
            "Risk-Based Authentication (RBA)",
            "Device fingerprinting",
            "OAuth 2.1 support",
        ], MID_BLUE),
        ("⚡ Performance & Scalability", [
            "Redis Cluster for HA session storage",
            "MongoDB sharding for large datasets",
            "CDN for static asset delivery",
            "API response caching layer",
            "Kubernetes auto-scaling",
        ], GREEN),
        ("🛡 Security Improvements", [
            "SIEM integration for threat detection",
            "Automated penetration testing CI/CD",
            "Real-time security alerting",
            "Regular vulnerability scanning pipeline",
            "Zero-trust network policy",
        ], RED),
        ("📊 Monitoring & Analytics", [
            "Real-time analytics dashboard",
            "PDF/Excel export for compliance reports",
            "User behavior analytics",
            "Customizable alert thresholds",
            "OpenTelemetry distributed tracing",
        ], GOLD),
    ]
    for i, (title, items, col) in enumerate(areas):
        cx = Inches(0.25) + (i % 2) * Inches(6.5)
        cy = Inches(1.75) + (i // 2) * Inches(2.7)
        add_rect(sl, cx, cy, Inches(6.3), Inches(2.55), WHITE)
        add_rect(sl, cx, cy, Inches(6.3), Inches(0.45), col)
        add_text(sl, title, cx + Inches(0.1), cy, Inches(6.1), Inches(0.45),
                 size=14, bold=True, color=WHITE)
        for j, item in enumerate(items):
            add_text(sl, f"  ▸  {item}",
                     cx + Inches(0.1), cy + Inches(0.55) + j * Inches(0.4),
                     Inches(6.0), Inches(0.38), size=12, color=DARK_GRAY)

slide_ch5_future()

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 24 — CONCLUSION
# ══════════════════════════════════════════════════════════════════════════════
def slide_conclusion():
    sl = prs.slides.add_slide(BLANK)
    add_rect(sl, 0, 0, W, H, DARK_NAVY)
    add_rect(sl, 0, 0, Inches(0.12), H, GOLD)
    add_rect(sl, Inches(0.12), Inches(3.25), W - Inches(0.12), Pt(2), GOLD)

    add_text(sl, "สรุป  /  Conclusion",
             Inches(0.5), Inches(0.3), Inches(8.0), Inches(0.65),
             size=28, bold=True, color=WHITE)

    achievements = [
        "พัฒนาระบบยืนยันตัวตนแบบ Monolithic ที่ครบวงจร รองรับ OAuth 2.0 + PKCE + OIDC",
        "ผ่านการทดสอบ 6 ประเภท: Jest 100% | Newman 98.6% | Playwright 97.8% | UAT 4.70/5.0",
        "ปฏิบัติตาม PDPA 2562 ครบทุกมาตราที่กำหนด (มาตรา 19, 27, 28, 33, 37, 40)",
        "รองรับการ scale ด้วย Nginx + 3 instances + Redis shared session",
        "0 Critical/High vulnerabilities จาก OWASP ZAP Baseline Scan",
    ]
    for i, ach in enumerate(achievements):
        add_rect(sl, Inches(0.5), Inches(1.1) + i * Inches(0.42), Inches(0.35), Inches(0.35), GOLD)
        add_text(sl, "✓", Inches(0.5), Inches(1.1) + i * Inches(0.42), Inches(0.35), Inches(0.35),
                 size=14, bold=True, color=DARK_NAVY, align=PP_ALIGN.CENTER)
        add_text(sl, ach, Inches(1.0), Inches(1.1) + i * Inches(0.42), Inches(11.8), Inches(0.38),
                 size=13, color=WHITE)

    # stats row bottom-left
    stats = [("104/104","Jest Tests"),("182/186","Playwright"),("69/69","Newman"),("4.70/5","UAT Score"),("0","Critical CVEs")]
    for i, (val, lbl) in enumerate(stats):
        x = Inches(0.5) + i * Inches(2.45)
        add_rect(sl, x, Inches(3.5), Inches(2.3), Inches(1.1), RGBColor(0x1A, 0x2A, 0x55))
        add_text(sl, val, x, Inches(3.52), Inches(2.3), Inches(0.62),
                 size=22, bold=True, color=GOLD, align=PP_ALIGN.CENTER)
        add_text(sl, lbl, x, Inches(4.1),  Inches(2.3), Inches(0.4),
                 size=11, color=LIGHT_BLUE, align=PP_ALIGN.CENTER)

    add_text(sl, "ขอบคุณ  /  Thank You",
             Inches(0.5), Inches(4.85), Inches(8.0), Inches(0.65),
             size=32, bold=True, color=GOLD)
    add_text(sl, "นภัทร มุนินิมิตร  •  ณัฐพล วงศ์ไวยุทธ  |  ปีการศึกษา 2567  |  KMITL",
             Inches(0.5), Inches(5.5), Inches(12.0), Inches(0.4),
             size=14, color=LIGHT_BLUE)
    add_text(sl, "Advisor: Asst. Prof. Kritsada Busra",
             Inches(0.5), Inches(5.9), Inches(12.0), Inches(0.35),
             size=13, color=MID_GRAY)

    # right panel decorative
    for i, (label, val) in enumerate([("Total API Endpoints","56"),("Docker Services","8"),("MongoDB Collections","7"),("Test Types","6")]):
        y = Inches(0.4) + i * Inches(1.55)
        add_rect(sl, Inches(9.5), y, Inches(3.5), Inches(1.35), RGBColor(0x1A, 0x2A, 0x55))
        add_text(sl, val,   Inches(9.5), y + Inches(0.05), Inches(3.5), Inches(0.72),
                 size=40, bold=True, color=GOLD, align=PP_ALIGN.CENTER)
        add_text(sl, label, Inches(9.5), y + Inches(0.82), Inches(3.5), Inches(0.4),
                 size=12, color=WHITE, align=PP_ALIGN.CENTER)

slide_conclusion()

# ══════════════════════════════════════════════════════════════════════════════
# SAVE
# ══════════════════════════════════════════════════════════════════════════════
prs.save(OUT)
print(f"Saved {prs.slides.__len__()} slides -> {OUT}")
