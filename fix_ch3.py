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
    para.runs[0].text = full.replace(old, new)
    for run in para.runs[1:]:
        run.text = ''
    return True

changes = []

for i, para in enumerate(doc.paragraphs):
    text = get_full_text(para)

    # Fix 1: Para 50 - Chinese character 只需 in infrastructure section
    if '只需 deploy' in text:
        ok = replace_in_para(para, '只需 deploy', 'deploy')
        if ok: changes.append(f'[{i}] Removed Chinese character 只需 from infrastructure para')

    # Fix 2: Para 58 - Vietnamese word "vào" in Token Blacklisting section
    if 'เพิ่ม vào blacklist' in text:
        ok = replace_in_para(para, 'เพิ่ม vào blacklist', 'เพิ่มเข้า blacklist')
        if ok: changes.append(f'[{i}] Fixed Vietnamese "vào" → Thai "เข้า" in token blacklisting section')

    # Fix 3: Para 54 - TokenBlacklist reason enum missing 'expired'
    if "reason: Enum [user_logout, admin_revoke, security_breach]" in text:
        ok = replace_in_para(para,
            'reason: Enum [user_logout, admin_revoke, security_breach]',
            'reason: Enum [user_logout, admin_revoke, security_breach, expired]')
        if ok: changes.append(f'[{i}] Added missing "expired" to TokenBlacklist reason enum in ER diagram')

doc.save(docx_path)
print(f'Done. {len(changes)} change(s):')
for c in changes:
    print(f'  {c}')
