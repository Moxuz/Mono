"""
insert_diagrams.py — Inserts diagram PNGs into TAS6-final.docx
Run from: Final-Final/

Inserts:
  รูปที่ 3.1  Use Case Diagram          → replaces placeholder at §3.3
  รูปที่ 3.3  Sequence Login             → after ER Diagram caption (§3.4)
  รูปที่ 3.4  Sequence OAuth PKCE        → after seq-login
  รูปที่ 3.5  DFD Level 0               → after seq-oauth
  รูปที่ 3.6  DFD Level 1               → after dfd-level0
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
from docx.shared import Inches, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

DIAGRAMS_DIR = os.path.join(os.path.dirname(__file__), 'diagrams', 'output')

doc = Document('TAS6-final.docx')

# ── helper: add an image paragraph after ref_para ────────────────────────────
def insert_image_after(ref_para, img_path, width_inches=5.5):
    """Insert a new paragraph with an inline image after ref_para."""
    new_p = OxmlElement('w:p')
    ref_para._p.addnext(new_p)
    paras = doc.paragraphs
    idx = next(i for i, p in enumerate(paras) if p._p is new_p)
    new_para = paras[idx]
    run = new_para.add_run()
    run.add_picture(img_path, width=Inches(width_inches))
    # Center the paragraph
    new_para.alignment = 1  # WD_ALIGN_PARAGRAPH.CENTER
    return new_para

def insert_text_after(ref_para, text, bold=False, italic=False, center=False):
    """Insert a new paragraph with text after ref_para."""
    new_p = OxmlElement('w:p')
    ref_para._p.addnext(new_p)
    paras = doc.paragraphs
    idx = next(i for i, p in enumerate(paras) if p._p is new_p)
    new_para = paras[idx]
    if text:
        run = new_para.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.size = Pt(12)
    if center:
        new_para.alignment = 1
    return new_para

# ════════════════════════════════════════════════════════════════════════════════
# 1. USE CASE DIAGRAM — insert at placeholder §3.3
# ════════════════════════════════════════════════════════════════════════════════
uc_placeholder = None
for para in doc.paragraphs:
    if 'Insert' in para.text and '3.1' in para.text and 'Use Case' in para.text:
        uc_placeholder = para
        break
    # fallback: Thai placeholder
    if '\u0e23\u0e39\u0e1b\u0e17\u0e35\u0e48 3.1' in para.text and 'Insert' in para.text:
        uc_placeholder = para
        break

if uc_placeholder:
    print(f"Found Use Case placeholder: {uc_placeholder.text[:60]}")
    # Insert image before the placeholder (i.e. after the paragraph before it)
    paras = doc.paragraphs
    idx = next(i for i, p in enumerate(paras) if p._p is uc_placeholder._p)
    ref = paras[idx - 1] if idx > 0 else uc_placeholder

    # Insert image after the preceding paragraph
    img_para = insert_image_after(ref, os.path.join(DIAGRAMS_DIR, 'usecase.png'), width_inches=5.5)
    # Remove the placeholder paragraph
    uc_placeholder._element.getparent().remove(uc_placeholder._element)
    print("  → Inserted usecase.png and removed placeholder")
else:
    print("WARNING: Use Case placeholder not found — inserting before caption")
    # Find the caption รูปที่ 3.1
    for para in doc.paragraphs:
        if '3.1' in para.text and 'Use Case' in para.text and len(para.text) < 40:
            paras = doc.paragraphs
            idx = next(i for i, p in enumerate(paras) if p._p is para._p)
            ref = paras[idx - 1] if idx > 0 else para
            insert_image_after(ref, os.path.join(DIAGRAMS_DIR, 'usecase.png'), 5.5)
            print(f"  → Inserted usecase.png before caption at para {idx}")
            break

# ════════════════════════════════════════════════════════════════════════════════
# 2. SEQUENCE + DFD — insert after รูปที่ 3.2 ER Diagram caption
# ════════════════════════════════════════════════════════════════════════════════
er_caption = None
for para in doc.paragraphs:
    txt = para.text.strip()
    if '3.2' in txt and ('ER Diagram' in txt or 'Entity Relationship' in txt) and len(txt) < 60:
        er_caption = para
        break

if not er_caption:
    print("WARNING: ER Diagram caption not found — will insert after §3.4 heading")
    for para in doc.paragraphs:
        if '3.4' in para.text and len(para.text) < 30:
            er_caption = para
            break

if not er_caption:
    print("ERROR: Could not find insertion point for Sequence/DFD diagrams"); sys.exit(1)

print(f"Found ER caption anchor: {er_caption.text[:60]}")

# Insert in reverse order so each "insert after er_caption" puts the new item
# immediately after, pushing subsequent ones further down.
# Final order: er_caption → [spacer] → [seq-login img + cap] → [seq-oauth img + cap] → [dfd-l0 img + cap] → [dfd-l1 img + cap]

# We'll insert forward by tracking the last inserted paragraph.
cur = er_caption

cur = insert_text_after(cur, '')  # spacer

# ── Sequence Login ────────────────────────────────────────────────────────────
cur = insert_text_after(cur, '3.4 Sequence Diagrams', bold=True)
cur = insert_text_after(cur, '')
cur = insert_text_after(cur,
    'Sequence Diagram แสดงลำดับการส่งข้อความระหว่าง components ในกระบวนการหลักสองกระบวนการ: '
    'การ Login แบบ Local และการ Authorization ด้วย OAuth 2.0 PKCE')
cur = insert_text_after(cur, '')
cur = insert_image_after(cur, os.path.join(DIAGRAMS_DIR, 'sequence-login.png'), width_inches=5.5)
cur = insert_text_after(cur, 'รูปที่ 3.3 Sequence Diagram: กระบวนการ Login (Local Authentication)', center=True)
print("  → Inserted sequence-login.png")

cur = insert_text_after(cur, '')

# ── Sequence OAuth ────────────────────────────────────────────────────────────
cur = insert_image_after(cur, os.path.join(DIAGRAMS_DIR, 'sequence-oauth.png'), width_inches=5.5)
cur = insert_text_after(cur, 'รูปที่ 3.4 Sequence Diagram: OAuth 2.0 PKCE Authorization Code Flow', center=True)
print("  → Inserted sequence-oauth.png")

cur = insert_text_after(cur, '')

# ── DFD Level 0 ───────────────────────────────────────────────────────────────
cur = insert_text_after(cur, '3.5 Data Flow Diagrams (DFD)', bold=True)
cur = insert_text_after(cur, '')
cur = insert_text_after(cur,
    'Data Flow Diagram แสดงการไหลของข้อมูลระหว่าง external entities และ processes ภายในระบบ '
    'Level 0 (Context Diagram) แสดงภาพรวมของระบบ และ Level 1 แสดงการแตก processes ย่อย')
cur = insert_text_after(cur, '')
cur = insert_image_after(cur, os.path.join(DIAGRAMS_DIR, 'dfd-level0.png'), width_inches=5.5)
cur = insert_text_after(cur, 'รูปที่ 3.5 Data Flow Diagram Level 0 (Context Diagram)', center=True)
print("  → Inserted dfd-level0.png")

cur = insert_text_after(cur, '')

# ── DFD Level 1 ───────────────────────────────────────────────────────────────
cur = insert_image_after(cur, os.path.join(DIAGRAMS_DIR, 'dfd-level1.png'), width_inches=5.5)
cur = insert_text_after(cur, 'รูปที่ 3.6 Data Flow Diagram Level 1 (Process Decomposition)', center=True)
print("  → Inserted dfd-level1.png")

# ════════════════════════════════════════════════════════════════════════════════
doc.save('TAS6-final.docx')
print("\nSaved TAS6-final.docx — all 5 diagrams inserted successfully")
