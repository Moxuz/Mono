"""
Content audit — checks inline paragraph text for:
1. Cross-references to table/figure numbers (stale after renumbering)
2. Remaining // placeholders or TODO comments
3. Specific factual claims vs known correct values
4. Chapter summary paragraphs
"""
import sys, re
from docx import Document

sys.stdout.reconfigure(encoding='utf-8')
DOC_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx"
doc = Document(DOC_PATH)
paras = doc.paragraphs

issues  = []
ok_list = []
notes   = []

def flag(label, detail):
    issues.append(f'  ISSUE [{label}]: {detail}')
def good(label, detail=''):
    ok_list.append(f'  OK    [{label}]: {detail}')
def note(label, detail):
    notes.append(f'  NOTE  [{label}]: {detail}')

# ─────────────────────────────────────────────────────────────────────────────
# 1. PLACEHOLDER / COMMENT scan
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 1. PLACEHOLDERS / COMMENTS ===')
placeholder_patterns = [
    r'//',          # code comments left in
    r'TODO',
    r'FIXME',
    r'X\.X',        # figure/table placeholders like 3.X or 4.X
    r'รูปที่\s+\d+\.x',
    r'ตารางที่\s+\d+\.x',
    r'xxx',
    r'\[FILL',
    r'\[ใส่',
    r'\[insert',
    r'\[TBD',
    r'TBD',
    r'ยังไม่',       # "not yet..."
]
found_any = False
for i, p in enumerate(paras):
    t = p.text
    if not t.strip():
        continue
    for pat in placeholder_patterns:
        if re.search(pat, t, re.IGNORECASE):
            flag(f'para[{i}]', f'Placeholder/comment pattern "{pat}": {t[:120]}')
            found_any = True
            break
if not found_any:
    good('Placeholders', 'None found')

# ─────────────────────────────────────────────────────────────────────────────
# 2. CROSS-REFERENCES to table numbers in body text
#    After renumbering: 3.1=Requirements, 3.2=API, 3.3=JWT, 3.4=RateLimit, 3.5=PDPA
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 2. TABLE CROSS-REFERENCES in body text ===')
ref_hits = {}
for i, p in enumerate(paras):
    t = p.text
    if not t.strip():
        continue
    # Find all "ตารางที่ N.M" references in body text (not the caption itself)
    if p.style.name.startswith('Heading'):
        continue
    refs = re.findall(r'ตารางที่\s+(\d+\.\d+|\d+\.\w+)', t)
    for ref in refs:
        if ref not in ref_hits:
            ref_hits[ref] = []
        ref_hits[ref].append((i, t[:120]))

print('  Table references found in body text:')
for ref, hits in sorted(ref_hits.items()):
    for idx, txt in hits:
        print(f'    ตารางที่ {ref} at para[{idx}]: {txt}')

# Flag suspicious ones (old numbering that pointed to wrong table)
# Old: 3.1=API, 3.2=JWT, 3.3=Rate, 3.4=PDPA, 3.5=Requirements
# New: 3.1=Requirements, 3.2=API, 3.3=JWT, 3.4=Rate, 3.5=PDPA
# Any body-text reference to "ตารางที่ 3.X" needs to still point correctly
for ref, hits in ref_hits.items():
    for idx, txt in hits:
        # Skip the caption paragraphs themselves
        if 'ตารางที่' in paras[idx].text and any(
            paras[idx].text.strip().startswith(f'ตารางที่ {ref}') for _ in [1]):
            continue
        note(f'Table ref ตารางที่ {ref}', f'para[{idx}]: verify still correct after renumber — {txt[:80]}')

# ─────────────────────────────────────────────────────────────────────────────
# 3. CROSS-REFERENCES to figure numbers
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 3. FIGURE CROSS-REFERENCES in body text ===')
fig_refs = {}
for i, p in enumerate(paras):
    t = p.text
    if not t.strip() or p.style.name.startswith('Heading'):
        continue
    refs = re.findall(r'รูปที่\s+(\d+\.\d+)', t)
    for ref in refs:
        if ref not in fig_refs:
            fig_refs[ref] = []
        fig_refs[ref].append((i, t[:100]))

print('  Figure references found in body text:')
for ref, hits in sorted(fig_refs.items()):
    for idx, txt in hits:
        print(f'    รูปที่ {ref} at para[{idx}]: {txt}')

# ─────────────────────────────────────────────────────────────────────────────
# 4. SPECIFIC TECHNICAL CLAIMS in body text
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 4. TECHNICAL FACT CLAIMS ===')

# Collect all paragraphs that contain specific technical values
tech_checks = {
    'bcrypt':        [],
    'rate limit':    [],
    'JWT':           [],
    'RS256':         [],
    'HS256':         [],
    'RSA':           [],
    'token expir':   [],
    '30 วัน':        [],
    '1 ชั่วโมง':     [],
    'session':       [],
    '90 วัน':        [],
    'port':          [],
    '5000':          [],
    'endpoint':      [],
    'PKCE':          [],
    'S256':          [],
    'plain':         [],
    'Refresh Token': [],
    'salt':          [],
    'cost':          [],
}
for i, p in enumerate(paras):
    t = p.text
    if not t.strip() or p.style.name.startswith('Heading'):
        continue
    for key in tech_checks:
        if key.lower() in t.lower():
            tech_checks[key].append((i, t[:160]))

# Print relevant hits
for key in ['bcrypt', 'RS256', 'RSA', 'salt', 'cost']:
    if tech_checks[key]:
        print(f'\n  [{key}] occurrences:')
        for idx, txt in tech_checks[key]:
            print(f'    para[{idx}]: {txt}')

# Flag RS256 in body text
if tech_checks['RS256']:
    for idx, txt in tech_checks['RS256']:
        flag(f'para[{idx}]', f'RS256 still mentioned in body: {txt[:100]}')
else:
    good('RS256', 'No RS256 in body paragraphs')

# Check bcrypt mentions — should say cost 10, not 12
for idx, txt in tech_checks['bcrypt']:
    if 'cost-12' in txt or 'cost 12' in txt or 'rounds 12' in txt or '12 rounds' in txt:
        flag(f'para[{idx}]', f'bcrypt cost-12 in body: {txt[:100]}')
    elif 'cost-10' in txt or 'cost 10' in txt or 'rounds 10' in txt or '10 rounds' in txt or 'salt rounds 10' in txt:
        good(f'bcrypt para[{idx}]', f'cost-10 correct: {txt[:80]}')

# ─────────────────────────────────────────────────────────────────────────────
# 5. CHAPTER STRUCTURE — print all headings
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 5. HEADING STRUCTURE ===')
for i, p in enumerate(paras):
    if p.style.name.startswith('Heading'):
        level = p.style.name
        print(f'  [{i}] ({level}) {p.text}')

# ─────────────────────────────────────────────────────────────────────────────
# 6. CHAPTER 5 SUMMARY PARAGRAPHS (conclusion claims)
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 6. CHAPTER 5 SUMMARY / CONCLUSION (para 1070+) ===')
for i, p in enumerate(paras):
    if i < 1070:
        continue
    t = p.text.strip()
    if t:
        print(f'  [{i}] {t[:180]}')

# ─────────────────────────────────────────────────────────────────────────────
# 7. ABSTRACT / INTRO key claims (para 116-155)
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 7. ABSTRACT / INTRODUCTION (para 116-160) ===')
for i in range(116, 161):
    t = paras[i].text.strip()
    if t:
        print(f'  [{i}] {t[:180]}')

# ─────────────────────────────────────────────────────────────────────────────
# REPORT
# ─────────────────────────────────────────────────────────────────────────────
print('\n' + '='*70)
print(f'ISSUES: {len(issues)}   OK: {len(ok_list)}   NOTES: {len(notes)}')
print('='*70)

if issues:
    print('\n--- ISSUES ---')
    for x in issues: print(x)

if notes:
    print('\n--- NOTES (verify manually) ---')
    for x in notes: print(x)

print('\n--- OK ---')
for x in ok_list: print(x)
