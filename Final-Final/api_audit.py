"""
API route audit: compares Table[2] in docx against actual routes
"""
import sys
from docx import Document

sys.stdout.reconfigure(encoding='utf-8')
DOC_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx"
doc = Document(DOC_PATH)

t = doc.tables[2]
print(f"Table[2] — {len(t.rows)} rows\n")
print("=== Full table dump (all 5 cols) ===")
for ri, row in enumerate(t.rows):
    cells = [c.text.strip() for c in row.cells]
    print(f"  R{ri:02d}: cat='{cells[0][:20]}' | method='{cells[1]}' | path='{cells[2]}' | auth='{cells[3]}' | desc='{cells[4][:50]}'")
