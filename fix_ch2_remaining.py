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

    # Fix 1: Para 32 - dangling "หรือ " from Facebook removal in Chapter 2
    # "สามารถรองรับการเข้าสู่ระบบผ่านบัญชีภายนอก (External Account) เช่น Google หรือ "
    if 'เช่น Google หรือ \n' in text or text.endswith('เช่น Google หรือ ') or 'เช่น Google หรือ \r' in text:
        ok = replace_in_para(para, 'เช่น Google หรือ ', 'เช่น Google หรือ GitHub ')
        if ok: changes.append(f'[{i}] Fixed dangling "หรือ " → "หรือ GitHub" in Chapter 2 login section')
    elif 'เช่น Google หรือ ' in text and 'GitHub' not in text:
        ok = replace_in_para(para, 'เช่น Google หรือ ', 'เช่น Google หรือ GitHub ')
        if ok: changes.append(f'[{i}] Fixed dangling "หรือ " → "หรือ GitHub" in login description')

    # Fix 2 & 3: Missing space "ง่ายdeploy" (from Chinese char removal) in paras 40 and 50
    if 'ง่ายdeploy' in text:
        ok = replace_in_para(para, 'ง่ายdeploy', 'ง่าย deploy')
        if ok: changes.append(f'[{i}] Fixed missing space: "ง่ายdeploy" → "ง่าย deploy"')

doc.save(docx_path)
print(f'Done. {len(changes)} change(s):')
for c in changes:
    print(f'  {c}')
