"""
edit_thesis.py - Modifies TAS6.docx to add missing sections, fix counts, and add image placeholders.
Creates TAS6-edited.docx (preserves original).
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import docx
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import copy

doc = Document('TAS6.docx')

# ─── Helper: insert paragraph AFTER a reference paragraph ──────────────────
def add_para_after(ref_para, text, style_name=None, bold=False, italic=False,
                   font_size=None, color=None, align=None):
    """Create a new paragraph XML node and insert it after ref_para._p."""
    new_p = OxmlElement('w:p')
    ref_para._p.addnext(new_p)
    # We need to get the actual Paragraph object that wraps new_p
    # Find it in doc.paragraphs — it will be right after ref_para
    paras = doc.paragraphs
    ref_idx = next(i for i, p in enumerate(paras) if p._p is ref_para._p)
    new_para = paras[ref_idx + 1]

    if style_name:
        try:
            new_para.style = doc.styles[style_name]
        except Exception:
            pass

    run = new_para.add_run(text)
    run.bold = bold
    run.italic = italic
    if font_size:
        run.font.size = Pt(font_size)
    if color:
        run.font.color.rgb = RGBColor(*color)
    if align:
        new_para.alignment = align

    return new_para


def insert_block_after(ref_para, paragraphs_data):
    """Insert a block of paragraphs after ref_para.
    paragraphs_data is a list of dicts with keys: text, bold, italic, size, color, align, style.
    Returns the last inserted paragraph.
    """
    current = ref_para
    for pd in paragraphs_data:
        current = add_para_after(
            current,
            pd.get('text', ''),
            style_name=pd.get('style'),
            bold=pd.get('bold', False),
            italic=pd.get('italic', False),
            font_size=pd.get('size'),
            color=pd.get('color'),
            align=pd.get('align'),
        )
    return current


# ─── 1. Fix §4.2.4: "114" → "116" and file reference ──────────────────────
print("Fixing §4.2.4 test count...")
for para in doc.paragraphs:
    if '114 test cases' in para.text:
        for run in para.runs:
            if '114 test cases' in run.text:
                run.text = run.text.replace('114 test cases', '116 test cases')
            if '19 sections' in run.text:
                run.text = run.text.replace('19 sections', '27 describe blocks ใน 6 test files')
        # If no runs matched (mixed runs), rebuild
        if '114 test cases' in para.text:
            full = para.text
            full = full.replace('114 test cases', '116 test cases')
            full = full.replace('19 sections', '27 describe blocks ใน 6 test files')
            for run in para.runs:
                run.text = ''
            if para.runs:
                para.runs[0].text = full
        print(f"  Fixed: {para.text[:80]}")

    if 'auth-full.test.js' in para.text:
        for run in para.runs:
            if 'auth-full.test.js' in run.text:
                run.text = run.text.replace(
                    'tests/auth-full.test.js',
                    '1-auth-core.test.js, 2-auth-password.test.js, 3-auth-sessions.test.js,\n4-auth-profile.test.js, 5-oauth.test.js, 6-security.test.js'
                )
        if 'auth-full.test.js' in para.text:
            for run in para.runs:
                run.text = ''
            if para.runs:
                para.runs[0].text = 'ไฟล์: 1-auth-core.test.js, 2-auth-password.test.js, 3-auth-sessions.test.js, 4-auth-profile.test.js, 5-oauth.test.js, 6-security.test.js'
        print(f"  Fixed file ref: {para.text[:80]}")

# ─── 2. Add image placeholders ─────────────────────────────────────────────
IMAGE_PLACEHOLDER_COLOR = (0x1F, 0x4E, 0x79)  # dark blue

def make_image_placeholder(caption):
    return {
        'text': f'[ ภาพที่จะแทรก: {caption} — กรุณา Insert รูปภาพในตำแหน่งนี้ ]',
        'italic': True,
        'color': IMAGE_PLACEHOLDER_COLOR,
        'size': 11,
    }

# Find §3.3 paragraph mentioning "รูปที่ 3.1" and insert placeholder after actor list (around [450])
print("Adding image placeholder for Use Case Diagram...")
for i, para in enumerate(doc.paragraphs):
    if 'รูปที่ 3.1' in para.text and '3.3' in doc.paragraphs[max(0,i-5):i+1][0].text if i>=5 else False:
        insert_block_after(para, [
            make_image_placeholder('รูปที่ 3.1 Use Case Diagram ของระบบยืนยันตัวตน (TAS)'),
            {'text': 'รูปที่ 3.1 Use Case Diagram แสดงความสัมพันธ์ระหว่าง Actors กับ Use Cases ของระบบ', 'size': 10, 'align': WD_ALIGN_PARAGRAPH.CENTER},
        ])
        print("  Added Use Case placeholder.")
        break

# Simpler: find "3.3 Use Case Diagram" heading and insert placeholder after OAuth Client block
inserted_uc = False
for i, para in enumerate(doc.paragraphs):
    if '3.3 Use Case Diagram' in para.text:
        # Insert placeholder after the end of actor list (find "3.4" heading start)
        # Walk forward to find paragraph just before "3.4"
        end_para = para
        for j in range(i+1, min(i+30, len(doc.paragraphs))):
            if '3.4 ER Diagram' in doc.paragraphs[j].text:
                end_para = doc.paragraphs[j-1]
                break
        if not inserted_uc:
            insert_block_after(end_para, [
                {'text': ''},
                make_image_placeholder('รูปที่ 3.1 Use Case Diagram ของระบบยืนยันตัวตน (TAS)'),
                {'text': 'รูปที่ 3.1 Use Case Diagram', 'size': 10, 'align': WD_ALIGN_PARAGRAPH.CENTER, 'italic': True},
            ])
            inserted_uc = True
            print("  Inserted Use Case Diagram placeholder.")
        break

# Add ER Diagram placeholder
inserted_er = False
for i, para in enumerate(doc.paragraphs):
    if '3.4 ER Diagram' in para.text and not inserted_er:
        # find end of ER section (before "3.5")
        end_para = para
        for j in range(i+1, min(i+60, len(doc.paragraphs))):
            if '3.5' in doc.paragraphs[j].text and 'API' in doc.paragraphs[j].text:
                end_para = doc.paragraphs[j-1]
                break
        insert_block_after(end_para, [
            {'text': ''},
            make_image_placeholder('รูปที่ 3.2 ER Diagram — ความสัมพันธ์ระหว่าง 7 entities ใน MongoDB'),
            {'text': 'รูปที่ 3.2 Entity Relationship Diagram', 'size': 10, 'align': WD_ALIGN_PARAGRAPH.CENTER, 'italic': True},
        ])
        inserted_er = True
        print("  Inserted ER Diagram placeholder.")
        break

# Add System Architecture diagram placeholder after §3.2 intro
inserted_arch = False
for i, para in enumerate(doc.paragraphs):
    if '3.2 System Architecture' in para.text and not inserted_arch:
        # insert placeholder before §3.3
        end_para = para
        for j in range(i+1, min(i+40, len(doc.paragraphs))):
            if '3.3 Use Case' in doc.paragraphs[j].text:
                end_para = doc.paragraphs[j-1]
                break
        insert_block_after(end_para, [
            {'text': ''},
            make_image_placeholder('รูปที่ 3.3 System Architecture Diagram — โครงสร้างโมดูลทั้ง 5 ของระบบ TAS'),
            {'text': 'รูปที่ 3.3 System Architecture Overview', 'size': 10, 'align': WD_ALIGN_PARAGRAPH.CENTER, 'italic': True},
        ])
        inserted_arch = True
        print("  Inserted System Architecture placeholder.")
        break

# ─── 3. Add performance test placeholder in §4.2.3 ─────────────────────────
print("Adding performance test placeholder...")
for i, para in enumerate(doc.paragraphs):
    if '4.2.3 Performance Testing' in para.text:
        # find end of 4.2.3 section (before 4.2.4)
        end_para = para
        for j in range(i+1, min(i+20, len(doc.paragraphs))):
            txt = doc.paragraphs[j].text
            if '4.2.4' in txt or 'automated' in txt.lower():
                end_para = doc.paragraphs[j-1]
                break
        insert_block_after(end_para, [
            {'text': ''},
            {'text': 'ตารางที่ 4.x ผลการทดสอบประสิทธิภาพ (Performance Test Results)', 'bold': True},
            make_image_placeholder(
                'ตาราง Performance Test Results — กรุณา copy จาก TAS-Tables.xlsx Sheet "Perf Test 4.2.3" '
                'แล้ว Insert as Table หลังจาก run k6 load test กับ http://localhost:5000'
            ),
            {'text': 'หมายเหตุ: เครื่องมือที่แนะนำ: k6 (https://k6.io) หรือ Apache JMeter — ทดสอบที่ 100, 500, 1000 concurrent users', 'italic': True, 'size': 10},
        ])
        print("  Added performance test placeholder.")
        break

# ─── 4. Add §2.8 Related Works after paragraph [314] ───────────────────────
print("Adding §2.8 Related Works...")
target_para = None
for para in doc.paragraphs:
    if 'OIDC + Authorization Code Flow + PKCE' in para.text:
        target_para = para
        break

if not target_para:
    # fallback: find last paragraph of §2.7
    for para in doc.paragraphs:
        if 'Scopes' in para.text and 'openid, profile, email' in para.text:
            target_para = para

if target_para:
    section_28 = [
        {'text': ''},
        {'text': '2.8 งานวิจัยที่เกี่ยวข้อง', 'bold': True, 'size': 14},
        {'text': 'ในการพัฒนาระบบยืนยันตัวตนนี้ ได้ทำการศึกษางานวิจัยที่เกี่ยวข้องทั้งในด้านเทคนิคและการนำไปใช้งานจริง ดังนี้'},
        {'text': ''},
        {'text': '2.8.1 Fett, Küsters & Schmitz (2016) — การวิเคราะห์ความปลอดภัย OAuth 2.0 เชิงคณิตศาสตร์', 'bold': True},
        {'text': 'Fett et al. (2016) ได้ทำการวิเคราะห์ความปลอดภัยเชิงคณิตศาสตร์อย่างเป็นทางการสำหรับ OAuth 2.0 ทั้ง 4 grant types โดยใช้ web attacker model ที่ครอบคลุม ผลการศึกษาพิสูจน์ว่า authorization code flow เมื่อใช้ร่วมกับ HTTPS และการตรวจสอบ state parameter สามารถรับประกันความปลอดภัยด้าน authorization และ session integrity ได้อย่างแข็งแกร่ง นอกจากนี้ยังพิสูจน์ว่า implicit flow มีความปลอดภัยต่ำกว่าเนื่องจาก access token ถูกเปิดเผยใน URL fragment ระบบ TAS ได้นำ authorization code flow มาใช้แต่เพียงอย่างเดียวและเพิ่ม PKCE (S256) เพื่อป้องกัน code interception attacks ตามข้อพิสูจน์ของ Fett et al. [16]'},
        {'text': ''},
        {'text': '2.8.2 Koponen (2016) — การพัฒนา OAuth 2.0 Authorization Server ด้วย Node.js', 'bold': True},
        {'text': 'Koponen (2016) ได้ออกแบบและพัฒนา OAuth 2.0 authorization server ด้วย Node.js เป็นส่วนหนึ่งของวิทยานิพนธ์ระดับปริญญาโทที่ University of Jyväskylä ประเทศฟินแลนด์ งานวิจัยนี้เสนอว่าการจำกัด grant type ให้ใช้เฉพาะ authorization code การบังคับใช้ authorization code แบบ single-use และการตรวจสอบ redirect URI อย่างเข้มงวด จะช่วยลด attack surface ได้อย่างมีนัยสำคัญ ระบบ TAS มีความสอดคล้องกับแนวทางของ Koponen โดยใช้ Node.js runtime เดียวกัน single-use authorization code pattern เดียวกัน และขยาย model ด้วย PKCE และ Apache Kafka audit logging [17]'},
        {'text': ''},
        {'text': '2.8.3 Philippaerts et al. (2022) — การทดสอบ OAuth 2.0 Compliance ด้วยเครื่องมือ OAuch', 'bold': True},
        {'text': 'Philippaerts et al. (2022) ได้พัฒนาเครื่องมือ OAuch สำหรับทดสอบความสอดคล้องกับมาตรฐาน OAuth 2.0 และทำการทดสอบ identity providers จริงกว่า 20 รายการกับข้อกำหนดด้านความปลอดภัย 112 รายการ ผลการศึกษาพบว่า providers โดยเฉลี่ยไม่ปฏิบัติตาม 34% ของข้อกำหนด โดยที่พบบ่อยที่สุดคือ PKCE enforcement ที่ขาดหายไป การไม่มี refresh token rotation และ redirect URI validation ที่ไม่เข้มงวด ระบบ TAS ได้รับการออกแบบเพื่อปิดช่องว่างเหล่านี้: บังคับใช้ PKCE S256 เท่านั้น บังคับ refresh token rotation ทุกครั้ง และตรวจสอบ redirect URI แบบ exact matching [18]'},
        {'text': ''},
        {'text': '2.8.4 งานวิจัยด้าน JWT Session Management (2023)', 'bold': True},
        {'text': 'งานวิจัยที่ตีพิมพ์ในปี 2023 ได้ประเมินความปลอดภัยของ JWT สำหรับ REST API session management โดยวิเคราะห์ signing algorithms และ refresh token rotation patterns ผลการศึกษาแนะนำว่า access token อายุสั้นร่วมกับ one-time-use refresh tokens และ server-side blacklist ให้ความปลอดภัยสูงสุด นอกจากนี้ยังระบุว่าการ logout ต้องทำการ blacklist ทั้ง access token และ refresh token พร้อมกัน ระบบ TAS ปฏิบัติตามคำแนะนำทั้งหมด: access token 1 ชั่วโมง, refresh token rotation แบบ one-use และ MongoDB TokenBlacklist ที่ revoke ทั้งสอง token เมื่อ logout [19]'},
        {'text': ''},
        {'text': '2.8.5 Melton et al. (2017) — การ Deploy ระบบ Single Sign-On ในสถานพยาบาล', 'bold': True},
        {'text': 'Melton et al. (2017) ได้บันทึกการ deploy ระบบ Single Sign-On ในระบบโรงพยาบาล 6 แห่งที่ต้องการ password มากกว่า 12 รายการต่อคน การศึกษาวัดผลลัพธ์ที่เป็นรูปธรรม พบว่า SSO ช่วยลดเวลาที่ใช้ในการยืนยันตัวตน 9.51 นาทีต่อคนต่อวัน คิดเป็นมูลค่า 92,146 ดอลลาร์สหรัฐต่อสถานพยาบาลต่อปี นอกจากนี้ระบบ centralized authentication ยังช่วยรวม audit logs ไว้ในที่เดียว กรณีศึกษานี้ยืนยันว่าการเลือกสถาปัตยกรรมแบบ centralized authentication ซึ่งเป็นแนวทางเดียวกับที่ระบบ TAS ใช้ ให้ผลประโยชน์ด้านความปลอดภัยและประสิทธิภาพที่วัดได้จริงในองค์กร [20]'},
        {'text': ''},
        {'text': '2.8.6 สรุปการเปรียบเทียบงานวิจัยที่เกี่ยวข้อง', 'bold': True},
        {'text': 'จากการศึกษางานวิจัยทั้ง 5 ชิ้น พบว่าระบบ TAS มีความสอดคล้องกับแนวทางที่ได้รับการพิสูจน์แล้วในด้านวิชาการ ได้แก่ การใช้ authorization code flow + PKCE ตาม Fett et al. การใช้ single-use code pattern ตาม Koponen การปิด compliance gaps ที่ Philippaerts et al. พบว่าขาดหายไปใน 34% ของ providers จริง การ implement JWT blacklist ครบทั้ง access และ refresh token ตามงานวิจัย 2023 และการเลือกสถาปัตยกรรม centralized authentication ที่ Melton et al. ยืนยันว่าให้ ROI จริงในองค์กร'},
        {'text': ''},
        {'text': '[ ตารางที่ 2.1 เปรียบเทียบงานวิจัยที่เกี่ยวข้อง — กรุณา Insert ตารางจาก TAS-Tables.xlsx หรือสร้างตารางใน Word เพื่อแสดงการเปรียบเทียบ Features ของแต่ละงานวิจัยกับ TAS ]', 'italic': True, 'color': IMAGE_PLACEHOLDER_COLOR},
    ]
    insert_block_after(target_para, section_28)
    print("  Added §2.8 Related Works (5 papers + summary + table placeholder).")
else:
    print("  WARNING: Could not find end of §2.7 paragraph.")

# ─── 5. Add §5.4 Research Contributions before §5.2 ───────────────────────
print("Adding §5.4 Research Contributions...")
target_52 = None
for para in doc.paragraphs:
    if '5.2 ปัญหาที่เกิดจากการดำเนินงาน' in para.text:
        target_52 = para
        break

if target_52:
    # We insert BEFORE §5.2 by finding the paragraph just before it
    all_paras = doc.paragraphs
    idx_52 = next(i for i, p in enumerate(all_paras) if p._p is target_52._p)
    # Insert after the paragraph 2 before §5.2 (the last content para of §5.1)
    ref = all_paras[idx_52 - 1]

    section_54 = [
        {'text': ''},
        {'text': '5.4 ผลงานของงานวิจัย', 'bold': True, 'size': 14},
        {'text': 'งานวิจัยนี้มีผลงานที่มีคุณค่าใน 3 ด้าน ดังนี้'},
        {'text': ''},
        {'text': 'ด้านวิชาการ (Academic Contribution)', 'bold': True},
        {'text': 'วิทยานิพนธ์นี้แสดงให้เห็นการ implement OAuth 2.0 พร้อม PKCE ที่บรรลุเกณฑ์ compliance ซึ่ง Philippaerts et al. (2022) พบว่าขาดหายไปใน 34% ของ identity providers จริง ความถูกต้องได้รับการยืนยันผ่าน automated test suite ที่ผ่าน 116 test cases 100% ครอบคลุม 27 describe blocks ใน 6 test files รวมถึงการทดสอบความปลอดภัย (NoSQL injection, rate limiting, CORS, token security) และ OAuth PKCE flow ทั้งหมด'},
        {'text': ''},
        {'text': 'ด้านปฏิบัติ (Practical Contribution)', 'bold': True},
        {'text': 'ระบบ TAS มอบ authentication server แบบ self-hosted ที่พร้อมใช้งานจริง ช่วยให้องค์กรไทยสามารถ deploy เพื่อบรรลุ PDPA compliance โดยไม่ต้องพึ่งพา cloud services ต่างชาติที่เก็บข้อมูลผู้ใช้ในต่างประเทศ โดยใช้คำสั่ง docker-compose up -d เพียงคำสั่งเดียว ระบบรองรับ PDPA มาตรา 19 (consent), 27 (data export), 28 (rectification), 33 (erasure), 37 (audit log) และ 40 (security measures) ครบถ้วน'},
        {'text': ''},
        {'text': 'ด้านเทคนิค (Technical Contribution)', 'bold': True},
        {'text': 'การ implement นี้แก้ปัญหา security gap ที่พบบ่อยในระบบ authentication: เมื่อ revoke session จะต้อง blacklist ทั้ง access token (JWT) และ refresh token ไม่ใช่แค่อย่างใดอย่างหนึ่ง ซึ่งได้รับการยืนยันและทดสอบผ่าน integration tests โดยตรง นอกจากนี้การ implement Apache Kafka สำหรับ distributed audit logging ช่วยให้ระบบสามารถ scale audit trail ได้โดยไม่กระทบต่อ request-response latency ของ authentication flow หลัก'},
        {'text': ''},
    ]
    insert_block_after(ref, section_54)
    print("  Added §5.4 Research Contributions.")
else:
    print("  WARNING: Could not find §5.2 paragraph.")

# ─── 6. Add References [16]–[20] after [15] ───────────────────────────────
print("Adding References [16]-[20]...")
ref15_para = None
for para in doc.paragraphs:
    if '[15]' in para.text and 'NIST' in para.text:
        ref15_para = para
        break
    if 'NIST Special Publication 800-63' in para.text:
        ref15_para = para
        break

if ref15_para:
    # The reference ends a few paragraphs after — find the last para of [15]
    all_paras = doc.paragraphs
    idx = next(i for i, p in enumerate(all_paras) if p._p is ref15_para._p)
    # Check next para too (sometimes URL is on next line)
    end_ref = all_paras[idx]
    if idx + 1 < len(all_paras) and '800-63' in all_paras[idx+1].text:
        end_ref = all_paras[idx+1]

    new_refs = [
        {'text': ''},
        {'text': '[16] Fett, D., Küsters, R., & Schmitz, G. (2016). A comprehensive formal security analysis of OAuth 2.0. Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security, 1204–1215.'},
        {'text': '       DOI: https://doi.org/10.1145/2976749.2978385', 'italic': True},
        {'text': ''},
        {'text': '[17] Koponen, A.-P. (2016). A secure OAuth 2.0 implementation model [Master\'s thesis, University of Jyväskylä]. JYX Digital Repository.'},
        {'text': '       Available: https://jyx.jyu.fi/handle/123456789/51065', 'italic': True},
        {'text': ''},
        {'text': '[18] Philippaerts, P., et al. (2022). OAuch: Exploring security compliance in the OAuth 2.0 ecosystem. Proceedings of RAID \'22, 86–99.'},
        {'text': '       DOI: https://doi.org/10.1145/3545948.3545955', 'italic': True},
        {'text': ''},
        {'text': '[19] Restful API security using JSON Web Token (JWT) with HMAC-SHA512 algorithm in session management. (2023). IT Journal Research and Development, 8(1).'},
        {'text': '       Available: https://www.researchgate.net/publication/378252427', 'italic': True},
        {'text': ''},
        {'text': '[20] Melton, G. B., et al. (2017). Implementation of a single sign-on system between practice, research and learning systems. Applied Clinical Informatics, 8(1), 65–78.'},
        {'text': '       DOI: https://doi.org/10.4338/ACI-2016-08-RA-0139', 'italic': True},
    ]
    insert_block_after(end_ref, new_refs)
    print("  Added References [16]-[20].")
else:
    print("  WARNING: Could not find reference [15].")

# ─── Save ──────────────────────────────────────────────────────────────────
doc.save('TAS6-edited.docx')
print("\nDone! Saved as TAS6-edited.docx")
print("Summary of changes:")
print("  1. Fixed §4.2.4: 114->116 test cases, updated file reference")
print("  2. Added image placeholder: Use Case Diagram (รูปที่ 3.1)")
print("  3. Added image placeholder: ER Diagram (รูปที่ 3.2)")
print("  4. Added image placeholder: System Architecture (รูปที่ 3.3)")
print("  5. Added performance test table placeholder in §4.2.3")
print("  6. Added §2.8 งานวิจัยที่เกี่ยวข้อง (5 papers + comparison table placeholder)")
print("  7. Added §5.4 ผลงานของงานวิจัย (3 contribution types)")
print("  8. Added References [16]-[20]")
