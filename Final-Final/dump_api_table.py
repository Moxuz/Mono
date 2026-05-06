"""
Dump Table[2] (API Endpoints) from docx for comparison with actual routes
"""
import sys
from docx import Document

sys.stdout.reconfigure(encoding='utf-8')
DOC_PATH = r"C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\TAS8-final (1).docx"
doc = Document(DOC_PATH)

t = doc.tables[2]
print(f"Table[2] — {len(t.rows)} rows x {len(t.columns)} cols\n")
print(f"{'#':<4} {'Method':<8} {'Endpoint':<50} {'Auth':<15} {'Description':<40}")
print("-" * 130)
for ri, row in enumerate(t.rows):
    cells = [c.text.strip() for c in row.cells]
    # Skip empty rows
    if not any(cells):
        continue
    print(f"{ri:<4} {cells[0]:<8} {cells[1]:<50} {cells[2] if len(cells)>2 else '':<15} {cells[3] if len(cells)>3 else '':<40}")
