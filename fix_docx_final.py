import sys
import re
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

changes = []

for i, para in enumerate(doc.paragraphs):
    text = get_full_text(para)
    if not text.strip():
        continue

    # Fix 1: Thai abstract - remove 2FA phrase (para ~11)
    # "การยืนยันตัวตนสองปัจจัย () และการจัดการความยินยอมตาม PDPA"
    if 'การยืนยันตัวตนสองปัจจัย () และการจัดการความยินยอมตาม PDPA' in text:
        ok = replace_in_para(para,
            'การยืนยันตัวตนสองปัจจัย () และการจัดการความยินยอมตาม PDPA',
            'และการจัดการความยินยอมตาม PDPA')
        if ok: changes.append(f'[{i}] Thai abstract: removed 2FA phrase')

    # Fix 2: English abstract - remove 2FA phrase (para ~14)
    if 'two-factor authentication (), and PDPA consent management' in text:
        ok = replace_in_para(para,
            'two-factor authentication (), and PDPA consent management',
            'and PDPA consent management')
        if ok: changes.append(f'[{i}] English abstract: removed 2FA phrase')

    # Fix 3: System architecture - remove 2FA bullet (para ~48)
    if 'การยืนยันตัวตนสองปัจจัย ()' in text:
        # Try with leading spaces and dash
        replaced = False
        for pattern in [
            '   - การยืนยันตัวตนสองปัจจัย ()',
            '- การยืนยันตัวตนสองปัจจัย ()',
            'การยืนยันตัวตนสองปัจจัย ()',
        ]:
            if pattern in text:
                ok = replace_in_para(para, pattern, '')
                if ok:
                    changes.append(f'[{i}] Arch/other: removed 2FA bullet line')
                    replaced = True
                    break

    # Fix 4: Tech section - fix dangling "และ " after Facebook removal (para ~62)
    if 'รองรับการล็อกอินผ่าน Google, GitHub และ ' in text:
        ok = replace_in_para(para,
            'รองรับการล็อกอินผ่าน Google, GitHub และ ',
            'รองรับการล็อกอินผ่าน Google และ GitHub')
        if ok: changes.append(f'[{i}] Tech section: fixed provider list (was dangling "และ ")')

    # Fix 5: UAT table row 15 - replace empty "2FA Setup" row (para ~66)
    # Original was "15 | 2FA Setup | ผ่าน | ตั้งค่า 2FA ด้วย QR code ได้"
    # After previous script: "15 |  Setup | ผ่าน | ตั้งค่า  ด้วย QR code ได้"
    if ' Setup | ผ่าน | ตั้งค่า  ด้วย QR code ได้' in text:
        ok = replace_in_para(para,
            ' Setup | ผ่าน | ตั้งค่า  ด้วย QR code ได้',
            'Security Audit Logs | ผ่าน | บันทึก security events ได้ถูกต้อง')
        if ok: changes.append(f'[{i}] UAT table: replaced 2FA Setup row with Security Audit Logs')

    # Fix 6: Checklist form - remove empty Facebook OAuth checkbox (para ~82)
    # Original was "☐ Facebook OAuth ทำงานได้ถูกต้อง" → after previous: "☐  OAuth ทำงานได้ถูกต้อง"
    if '☐  OAuth ทำงานได้ถูกต้อง' in text:
        # Replace the whole line
        ok = replace_in_para(para, '   ☐  OAuth ทำงานได้ถูกต้อง', '')
        if not ok:
            ok = replace_in_para(para, '☐  OAuth ทำงานได้ถูกต้อง', '')
        if ok: changes.append(f'[{i}] Checklist form: removed empty Facebook OAuth checkbox')

    # Also fix any remaining double-spaces from Facebook removal
    if 'Google, GitHub และ\n' in text or text.endswith('Google, GitHub และ'):
        ok = replace_in_para(para, 'Google, GitHub และ', 'Google และ GitHub')
        if ok: changes.append(f'[{i}] Fixed trailing "Google, GitHub และ"')

doc.save(docx_path)
print(f'Done. {len(changes)} change(s) applied:')
for c in changes:
    print(f'  {c}')
