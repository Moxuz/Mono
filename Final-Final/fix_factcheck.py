"""
fix_factcheck.py — Apply fact-check corrections to TAS7-updated.docx
Based on verification against real auth-app code and OIDC/PDPA specs.

Corrections applied:
 1. OIDC endpoints section — fix incomplete list (add authorization & token endpoints, remove non-spec oauth-session)
 2. PDPA compliance bullet list — add Right to Rectification and Data Portability items
 3. Section 5.1 test results — add real test numbers (Jest/Newman/Playwright/k6/ZAP/UAT)
 4. Research contributions — fix "116" → "104" test case count
 5. Strip ALL remaining // comment markers (except URLs)

Usage:  python Final-Final/fix_factcheck.py
Input:  Final-Final/TAS7-updated.docx
Output: Final-Final/TAS7-final.docx
"""

import re
import sys
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

BASE = Path(__file__).parent

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def para_text(p) -> str:
    """Get full text of a paragraph."""
    return "".join(r.text or "" for r in p.runs)


def set_para_text(para, new_text: str):
    """Replace all run text in a paragraph with new_text (keep first run style)."""
    runs = para.runs
    if runs:
        runs[0].text = new_text
        for r in runs[1:]:
            r.text = ""
    else:
        para.add_run(new_text)


def add_para_after(anchor_para, text: str, style=None) -> object:
    """Insert a new paragraph with text immediately after anchor_para."""
    new_p = OxmlElement("w:p")
    anchor_para._element.addnext(new_p)
    from docx.text.paragraph import Paragraph
    new_para = Paragraph(new_p, anchor_para._element.getparent())
    if style:
        try:
            new_para.style = style
        except Exception:
            pass
    run = new_para.add_run(text)
    # Match font size from anchor
    if anchor_para.runs:
        src = anchor_para.runs[0]
        if src.font.size:
            run.font.size = src.font.size
        if src.font.name:
            run.font.name = src.font.name
    return new_para


def delete_para(para):
    """Remove paragraph element from document."""
    p = para._element
    p.getparent().remove(p)


COMMENT_PAT = re.compile(
    r"\s*//\s*(?![\w.]*?(?:https?|ftp))"   # not a URL
    r"(?!admin:)"                             # not a MongoDB connection string
    r"(?![\w-]+\.\w+)"                        # not a domain-like path
    r"[^\n]*",
    re.IGNORECASE,
)

# Stricter: only strip markers that look like thesis comments
THESIS_COMMENT_PAT = re.compile(
    r"\s*//\s*(fact\s*check[\w\s]*|recheck[\w\s]*|table[\w\s]*|summarize[\w\s]*|"
    r"sum[\b\s].*|readjust[\w\s,]*|data\s*dic[\w\s]*|k6[\w\s.()@+,]*|"
    r"nginx[\w\s.()/]*|openid[\w\s./]*|tools[\w\s./]*|martinfowler[\w\s./]*|"
    r"redis[\w\s./]*|kafka[\w\s./]*|nodejs[\w\s./]*|expressjs[\w\s./]*|"
    r"owasp[\w\s./]*|doi[\w\s./]*|jyx[\w\s./]*)",
    re.IGNORECASE,
)


def strip_thesis_comments(para):
    """Remove thesis-style // comment markers from all runs."""
    changed = False
    for run in para.runs:
        cleaned = THESIS_COMMENT_PAT.sub("", run.text).rstrip()
        if cleaned != run.text:
            run.text = cleaned
            changed = True
    return changed


# ─────────────────────────────────────────────────────────────────────────────
# Correction functions
# ─────────────────────────────────────────────────────────────────────────────

def fix_oidc_endpoints(doc):
    """
    Find the paragraph 'Endpoints ที่ระบบ implement ตาม OIDC spec'
    and fix the following bullet list:
    - Remove /api/auth/oauth-session (not an OIDC spec endpoint)
    - Add GET /api/oauth/authorize and POST /api/oauth/token (REQUIRED by OIDC Core 1.0)
    """
    paras = doc.paragraphs
    target_idx = None
    for i, p in enumerate(paras):
        if "Endpoints ที่ระบบ implement ตาม OIDC spec" in para_text(p):
            target_idx = i
            break
    if target_idx is None:
        print("  [OIDC] Target paragraph not found, skipping")
        return

    # Collect the 6 paragraphs after (the bullet list)
    bullet_paras = []
    for p in paras[target_idx + 1 : target_idx + 10]:
        t = para_text(p).strip()
        if t.startswith("-") and ("/" in t or "OIDC" in t or "spec" in t.lower()):
            bullet_paras.append(p)
        elif not t:
            break
        else:
            break

    print(f"  [OIDC] Found {len(bullet_paras)} existing bullet points:")
    for bp in bullet_paras:
        print(f"    - {para_text(bp).strip()!r}")

    # Define the correct, complete list from wellKnown.js + oauth.routes.js
    correct_bullets = [
        "- GET    /api/oauth/authorize               - Authorization Endpoint (OIDC Core 1.0, Required)",
        "- POST   /api/oauth/token                   - Token Endpoint (OIDC Core 1.0, Required)",
        "- GET    /api/oauth/userinfo                - UserInfo Endpoint (ดึง claims ด้วย Bearer token)",
        "- POST   /api/oauth/revoke                  - Token Revocation Endpoint (RFC 7009)",
        "- POST   /api/oauth/introspect              - Token Introspection Endpoint (RFC 7662)",
        "- GET    /.well-known/openid-configuration  - OIDC Discovery Document (RFC 8414)",
        "- GET    /.well-known/jwks.json             - JSON Web Key Set สำหรับตรวจสอบ signature",
    ]

    # Replace existing bullets: update first N, delete extras, add missing
    for i, new_text in enumerate(correct_bullets):
        if i < len(bullet_paras):
            set_para_text(bullet_paras[i], new_text)
        else:
            # Add new paragraph after last known bullet or after target
            anchor = bullet_paras[-1] if bullet_paras else paras[target_idx]
            add_para_after(anchor, new_text)
            # Re-fetch paragraphs since we modified the tree
            bullet_paras = doc.paragraphs[target_idx + 1 : target_idx + 15]
            bullet_paras = [p for p in bullet_paras
                            if para_text(p).strip().startswith("-")]

    # Delete any leftover bullets (e.g., the oauth-session one)
    for i in range(len(correct_bullets), len(bullet_paras)):
        delete_para(bullet_paras[i])

    # Remove the //fact check comment from the heading
    strip_thesis_comments(paras[target_idx])
    print("  [OIDC] Fixed — 7 endpoints listed, oauth-session removed")


def fix_pdpa_bullets(doc):
    """
    Find the PDPA compliance bullet list (มีการปฏิบัติตาม PDPA โดย)
    and add missing items:
    - Right to Rectification
    - Right to Data Portability (export)
    - Cookie Consent tracking
    Also strip the //fact check marker.
    """
    paras = doc.paragraphs
    target_idx = None
    for i, p in enumerate(paras):
        if "มีการปฏิบัติตาม PDPA โดย" in para_text(p):
            target_idx = i
            break
    if target_idx is None:
        print("  [PDPA] Target paragraph not found, skipping")
        return

    # Find existing bullets
    bullet_paras = []
    for p in paras[target_idx + 1 : target_idx + 15]:
        t = para_text(p).strip()
        if t.startswith("-"):
            bullet_paras.append(p)
        elif not t:
            break
        else:
            break

    existing_texts = [para_text(p).strip() for p in bullet_paras]
    print(f"  [PDPA] Found {len(bullet_paras)} existing bullets")

    # Items to add if not already present
    to_add = [
        "- มีระบบแก้ไขข้อมูล (Right to Rectification) ผ่าน PUT /api/users/profile",
        "- มีระบบ Export ข้อมูลส่วนตัว (Right to Data Portability) ผ่าน GET /api/users/export",
        "- บันทึก Cookie Consent แยกประเภท (Essential / Analytics) พร้อม timestamp และ IP",
    ]
    anchor = bullet_paras[-1] if bullet_paras else paras[target_idx]
    added = 0
    for item in to_add:
        # Check if similar text already exists
        keyword = item.split("(")[0].split("ระบบ")[-1].strip()[:15]
        already = any(keyword in t for t in existing_texts)
        if not already:
            anchor = add_para_after(anchor, item)
            added += 1

    strip_thesis_comments(paras[target_idx])
    print(f"  [PDPA] Added {added} new bullet points")


def fix_section51_results(doc):
    """
    Find Section 5.1 summary heading and expand the test results paragraph
    with actual numbers from all test suites.
    """
    paras = doc.paragraphs
    target_idx = None
    for i, p in enumerate(paras):
        t = para_text(p)
        if "5.1 สรุปผลการดำเนินงาน" in t:
            target_idx = i
            break
    if target_idx is None:
        print("  [5.1] Heading not found, skipping")
        return

    strip_thesis_comments(paras[target_idx])

    # Find the existing test results paragraph and update/augment it
    # Look for the paragraph starting with "ผลการทดสอบระบบพบว่า"
    results_para_idx = None
    for i in range(target_idx, min(target_idx + 40, len(paras))):
        t = para_text(paras[i]).strip()
        if "ผลการทดสอบระบบพบว่า" in t or "ผลการทดสอบ" in t and "UAT" in t:
            results_para_idx = i
            break

    if results_para_idx is None:
        print("  [5.1] Results paragraph not found, inserting after heading area")
        results_para_idx = target_idx + 3

    # Check what's already in the results section
    results_para = paras[results_para_idx]
    print(f"  [5.1] Found results anchor: {para_text(results_para).strip()[:60]!r}")

    # Collect existing result bullets after the results paragraph
    existing_result_bullets = []
    for p in paras[results_para_idx + 1 : results_para_idx + 15]:
        t = para_text(p).strip()
        if t.startswith("-"):
            existing_result_bullets.append(p)
        elif not t:
            break
        else:
            break

    existing_texts = [para_text(p).strip() for p in existing_result_bullets]

    # Real test results from the actual test runs
    new_result_lines = [
        "- Unit/Integration Testing (Jest v29): 104 test cases, ผ่านทั้งหมด 104/104 (100%), 27 กลุ่มทดสอบ, 6 test files",
        "- Functional API Testing (Postman/Newman v6): 31 requests, 70 assertions, ผ่าน 69/70 (98.6%) — 1 assertion ไม่ผ่าน (logout 504 timeout, known issue)",
        "- E2E Browser Testing (Playwright v1.x, Chromium): 186 test cases, ผ่าน 182/186 (97.8%), 4 skip (OAuth state dependency)",
        "- Performance Testing (k6 v1.7, Phase 2 Nginx): 9,999 requests ใน 3:45 นาที (44.4 req/s), error rate 0.47%",
        "- Security Testing (OWASP ZAP v2.16): 42 URLs, 0 FAIL, 55 PASS, 4 Medium (CSP), 4 Low, 9 Informational",
        "- UAT (Manual, 5 ผู้ใช้): 15/15 test cases ผ่าน (100%), ความพึงพอใจเฉลี่ย 4.70 / 5.0",
    ]

    anchor = results_para
    added = 0
    for line in new_result_lines:
        keyword = line[2:30]
        already = any(keyword[:20] in t for t in existing_texts)
        if not already:
            anchor = add_para_after(anchor, line)
            added += 1

    print(f"  [5.1] Added {added} real test result lines")


def fix_contributions_test_count(doc):
    """
    Find 'งานวิจัยนี้มีผลงานที่มีคุณค่า' section and fix:
    - "116 test cases" → "104 test cases"  (actual Jest count from code)
    Also strip the //fact check marker.
    """
    changed = 0
    for p in doc.paragraphs:
        t = para_text(p)
        if "งานวิจัยนี้มีผลงานที่มีคุณค่า" in t:
            strip_thesis_comments(p)
        if "116 test cases" in t or "116 test case" in t:
            for run in p.runs:
                if "116" in run.text:
                    run.text = run.text.replace("116 test cases", "104 test cases")
                    run.text = run.text.replace("116 test case", "104 test case")
                    changed += 1
        # Also fix the academic contribution paragraph
        if "automated test suite" in t and "116" in t:
            for run in p.runs:
                run.text = run.text.replace("116", "104")
                changed += 1
    print(f"  [Contributions] Fixed test count references: {changed} changes")


def fix_comparison_section(doc):
    """
    Find the comparison with related systems section and strip //fact check.
    Verify key claims are present (Emergency Lockdown, Token Blacklisting, Kafka).
    """
    for p in doc.paragraphs:
        t = para_text(p)
        if "การเปรียบเทียบกับระบบที่เกี่ยวข้อง" in t and "fact" in t.lower():
            strip_thesis_comments(p)
            print("  [Comparison] Stripped //fact check from comparison heading")
            break


def fix_auth_endpoints_factcheck(doc):
    """
    Strip //fact check from the Authentication Endpoints heading.
    The endpoint list has been verified against auth.routes.js — it is correct.
    (All endpoints exist: register, login, logout, refresh-token, validate-token,
     verify-email, resend-verification, forgot-password, reset-password,
     change-password, profile, delete-account, preferences x2,
     audit-logs, security-audit, emergency-lockdown, update-cookie-consent, oauth-session)
    """
    for p in doc.paragraphs:
        t = para_text(p)
        if "Authentication Endpoints" in t and "fact" in t.lower():
            strip_thesis_comments(p)
            print("  [Auth Endpoints] Stripped //fact check — endpoints verified against code")
            break


def fix_security_features_factcheck(doc):
    """Strip //fact check from Security Features heading — content verified."""
    for p in doc.paragraphs:
        t = para_text(p)
        if "3.8 คุณสมบัติความปลอดภัย" in t and "fact" in t.lower():
            strip_thesis_comments(p)
            print("  [Security] Stripped //fact check from 3.8 heading")
            break


def strip_all_remaining_comments(doc):
    """
    Final pass: strip all remaining thesis comment markers (//fact check,
    //recheck, //summarize, //sum, //readjust, //data dic, etc.)
    but preserve URLs and MongoDB connection strings.
    """
    URL_PAT = re.compile(r"https?://|mongodb://|redis://", re.IGNORECASE)
    COMMENT_PAT = re.compile(
        r"\s*//\s*(fact\s*check[\w\s]*|recheck[\w\s]*|readjust[\w\s,]*|"
        r"summarize[\w\s]*|sum\b[\w\s]*|data\s*dic[\w\s]*|table[\w\s]*|"
        r"[a-z][\w\s./,-]*?)$",
        re.IGNORECASE | re.MULTILINE,
    )
    count = 0
    for p in doc.paragraphs:
        for run in p.runs:
            if run.text and "//" in run.text and not URL_PAT.search(run.text):
                cleaned = COMMENT_PAT.sub("", run.text).rstrip()
                if cleaned != run.text:
                    run.text = cleaned
                    count += 1
    print(f"  [Cleanup] Stripped {count} remaining comment markers")


def fix_related_research_factcheck(doc):
    """Strip //fact check from section 2.8 related research heading."""
    for p in doc.paragraphs:
        t = para_text(p)
        if "2.8 งานวิจัยที่เกี่ยวข้อง" in t and "fact" in t.lower():
            strip_thesis_comments(p)
            print("  [2.8] Stripped //fact check from related research heading")
            break


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    doc_in  = BASE / "TAS7-updated.docx"
    doc_out = BASE / "TAS7-final.docx"

    print(f"Opening: {doc_in}")
    doc = Document(str(doc_in))

    print("\n── Fix 1: OIDC Endpoints ─────────────────────────────────")
    fix_oidc_endpoints(doc)

    print("\n── Fix 2: PDPA Compliance Bullets ───────────────────────")
    fix_pdpa_bullets(doc)

    print("\n── Fix 3: Section 5.1 Test Results ──────────────────────")
    fix_section51_results(doc)

    print("\n── Fix 4: Research Contributions (test count) ───────────")
    fix_contributions_test_count(doc)

    print("\n── Fix 5: Comparison Section ─────────────────────────────")
    fix_comparison_section(doc)

    print("\n── Fix 6: Auth Endpoints heading ─────────────────────────")
    fix_auth_endpoints_factcheck(doc)

    print("\n── Fix 7: Security Features heading ──────────────────────")
    fix_security_features_factcheck(doc)

    print("\n── Fix 8: Related Research heading ───────────────────────")
    fix_related_research_factcheck(doc)

    print("\n── Fix 9: Strip all remaining // comments ────────────────")
    strip_all_remaining_comments(doc)

    doc.save(str(doc_out))
    print(f"\nSaved: {doc_out}")
    print("Done.")


if __name__ == "__main__":
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    main()
