"""
Run all test suites and capture terminal output as PNG images.
Saves to tests/pic/

Usage:
    cd C:\\Users\\ASUS\\Documents\\TEST\\TESTMONO
    python tests/run_all_and_capture.py

Requirements:
    pip install matplotlib pillow
    Docker stack must be running: docker-compose up -d
"""

import subprocess, os, sys, re, time, textwrap
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

ROOT  = Path(__file__).parent.parent
PIC   = Path(__file__).parent / "pic"
PIC.mkdir(exist_ok=True)

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost")
NOW      = datetime.now().strftime("%Y%m%d_%H%M%S")

# ── ANSI strip ────────────────────────────────────────────────────────────────
ANSI = re.compile(r'\x1b\[[0-9;]*[mGKHF]')

def strip_ansi(text):
    return ANSI.sub('', text)

# ── render text → PNG ─────────────────────────────────────────────────────────
def save_png(title, raw_output, filename, passed=None, failed=None, elapsed=None):
    lines = strip_ansi(raw_output).splitlines()
    # wrap long lines
    wrapped = []
    for l in lines:
        if len(l) > 120:
            wrapped.extend(textwrap.wrap(l, 120))
        else:
            wrapped.append(l)

    # colour each line
    colours = []
    for l in wrapped:
        ll = l.lower()
        if any(x in ll for x in ['✅', 'pass', 'ok', ' passed', '✓', 'done']):
            colours.append('#22bb55')
        elif any(x in ll for x in ['❌', 'fail', 'error', 'err ', '✗', 'assert']):
            colours.append('#ff4444')
        elif any(x in ll for x in ['warn', '⚠', 'skip', 'pending', '⏳']):
            colours.append('#ffaa00')
        elif l.startswith('──') or l.startswith('══') or l.startswith('##'):
            colours.append('#88ccff')
        else:
            colours.append('#cccccc')

    font_size = 7.5
    line_h    = 0.013
    fig_h     = max(4, min(len(wrapped) * line_h + 1.5, 30))
    fig_w     = 16

    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    fig.patch.set_facecolor('#1e1e1e')
    ax.set_facecolor('#1e1e1e')
    ax.axis('off')

    # header bar
    header = f"  {title}"
    if elapsed:  header += f"  |  {elapsed:.1f}s"
    if passed is not None:
        col = '#22bb55' if failed == 0 else '#ff4444'
        header += f"  |  {passed} passed"
        if failed:
            header += f"  /  {failed} failed"
        ax.text(0.5, 1.0, header, transform=ax.transAxes,
                fontsize=10, fontweight='bold', color=col,
                ha='center', va='top',
                bbox=dict(facecolor='#2d2d2d', edgecolor=col, linewidth=1.5, pad=4))
    else:
        ax.text(0.5, 1.0, header, transform=ax.transAxes,
                fontsize=10, fontweight='bold', color='#88ccff',
                ha='center', va='top',
                bbox=dict(facecolor='#2d2d2d', edgecolor='#88ccff', linewidth=1.5, pad=4))

    # body lines (bottom-up so first line appears at top)
    total_lines = len(wrapped)
    y_start = 0.97
    y_step  = (y_start - 0.02) / max(total_lines, 1)

    for i, (line, col) in enumerate(zip(wrapped, colours)):
        y = y_start - i * y_step
        if y < 0.01:
            ax.text(0.02, 0.01, f'... ({total_lines - i} more lines)', transform=ax.transAxes,
                    fontsize=font_size, color='#888888', va='bottom',
                    fontfamily='monospace')
            break
        ax.text(0.01, y, line, transform=ax.transAxes,
                fontsize=font_size, color=col, va='top',
                fontfamily='monospace')

    # timestamp footer
    ax.text(0.99, 0.005, f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            transform=ax.transAxes, fontsize=6, color='#555555', ha='right', va='bottom')

    out = PIC / filename
    fig.savefig(out, dpi=130, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"  📸 Saved: {out.name}")
    return out

# ── run command ───────────────────────────────────────────────────────────────
def run(cmd, cwd=None, env_extra=None, timeout=300, shell=True):
    import platform
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    t0 = time.time()
    proc = subprocess.Popen(
        cmd, cwd=cwd or ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, env=env, shell=shell
    )
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
        out = (stdout or '') + (stderr or '')
        elapsed = time.time() - t0
        return out, proc.returncode, elapsed
    except subprocess.TimeoutExpired:
        # Kill entire process tree (handles shell=True child processes on Windows)
        if platform.system() == 'Windows':
            subprocess.run(
                f'taskkill /f /t /pid {proc.pid}',
                shell=True, capture_output=True
            )
        else:
            import signal, os as _os
            try:
                _os.killpg(_os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:
                proc.kill()
        try:
            stdout, stderr = proc.communicate(timeout=5)
        except Exception:
            stdout, stderr = '', ''
        out = (stdout or '') + (stderr or '')
        return f"TIMEOUT after {timeout}s\n{out}", 1, timeout
    except Exception as e:
        proc.kill()
        return f"ERROR: {e}", 1, 0

# ── parse Jest summary ─────────────────────────────────────────────────────────
def parse_jest(output):
    passed = failed = 0
    for line in output.splitlines():
        m = re.search(r'(\d+) passed', line)
        if m: passed = int(m.group(1))
        m = re.search(r'(\d+) failed', line)
        if m: failed = int(m.group(1))
    return passed, failed

# ── parse Newman summary ──────────────────────────────────────────────────────
def parse_newman(output):
    # Newman table format: │  assertions  │  <executed>  │  <failed>  │
    passed = failed = 0
    for line in output.splitlines():
        # Match assertions row in table: "assertions │ 69 │ 0"
        m = re.search(r'assertions\s*[│|]\s*(\d+)\s*[│|]\s*(\d+)', line)
        if m:
            total   = int(m.group(1))
            failed  = int(m.group(2))
            passed  = total - failed
            return passed, failed
        # Fallback: legacy "X passing" / "X failing" format
        m = re.search(r'(\d+)\s+passing', line)
        if m: passed = int(m.group(1))
        m = re.search(r'(\d+)\s+failing', line)
        if m: failed = int(m.group(1))
    return passed, failed

# ── parse k6 summary ─────────────────────────────────────────────────────────
def parse_k6(output):
    # New k6 format: "checks_succeeded...: 99.98% 84995 out of 85008"
    # Old format: "checks ........... 99.98%"
    m = re.search(r'checks_succeeded[.·\s]+:\s*([\d.]+)%', output)
    if m:
        pct = float(m.group(1))
        total_m = re.search(r'checks_total[.·\s]+:\s*(\d+)', output)
        failed_m = re.search(r'checks_failed[.·\s]+:\s*[\d.]+%\s+(\d+)', output)
        rps_m = re.search(r'http_reqs[.·\s]+:\s*\d+\s+([\d.]+)/s', output)
        total  = int(total_m.group(1)) if total_m else None
        failed = int(failed_m.group(1)) if failed_m else None
        rps    = rps_m.group(1) if rps_m else None
        return pct, total, failed, rps
    # Old format fallback
    m = re.search(r'checks\s+[.·]+\s+([\d.]+)%', output)
    pct = float(m.group(1)) if m else None
    rps_m = re.search(r'http_reqs\s+[.·]+\s+([\d.]+)/s', output)
    rps = rps_m.group(1) if rps_m else None
    return pct, None, None, rps

# ─────────────────────────────────────────────────────────────────────────────
# SUITE 1 — test:functions (no server needed)
# ─────────────────────────────────────────────────────────────────────────────
print("\n🧪 [1/6] test:functions ...")
out1, rc1, el1 = run("node scripts/test-functions.js")
m = re.search(r'Results:\s*(\d+) passed,\s*(\d+) failed', out1)
p1, f1 = (int(m.group(1)), int(m.group(2))) if m else (None, None)
save_png("test:functions — Pure Unit Tests (no server)", out1,
         f"01_test_functions_{NOW}.png", p1, f1, el1)
print(f"  Result: {p1} passed, {f1} failed  (exit {rc1})")

# ─────────────────────────────────────────────────────────────────────────────
# SUITE 2 — Jest integration tests
# ─────────────────────────────────────────────────────────────────────────────
# Flush Redis rate-limit keys so registration tests don't hit 429
run("docker exec auth-redis redis-cli FLUSHDB", timeout=10)
print("\n🧪 [2/6] Jest integration tests (via Nginx: %s) ..." % BASE_URL)
jest_files = " ".join([
    "tests/1-auth-core.test.js",
    "tests/2-auth-password.test.js",
    "tests/3-auth-sessions.test.js",
    "tests/4-auth-profile.test.js",
    "tests/5-oauth.test.js",
    "tests/6-security.test.js",
])
out2, rc2, el2 = run(
    f"npx jest {jest_files} --detectOpenHandles --verbose --runInBand --forceExit",
    env_extra={"TEST_BASE_URL": BASE_URL},
    timeout=300
)
p2, f2 = parse_jest(out2)
save_png(f"Jest Integration Tests ({BASE_URL})", out2,
         f"02_jest_integration_{NOW}.png", p2, f2, el2)
print(f"  Result: {p2} passed, {f2} failed  (exit {rc2})")

# ─────────────────────────────────────────────────────────────────────────────
# SUITE 3 — Security & module tests
# All files use process.exit() — run with node directly
# ─────────────────────────────────────────────────────────────────────────────
print("\n🧪 [3/6] Jest security & module tests ...")

# 3a — module-load (standalone node script — also calls process.exit)
out3a, rc3a, el3a = run(
    "node tests/module-load.test.js",
    env_extra={"TEST_BASE_URL": BASE_URL},
    timeout=90
)
ml_pass = len(re.findall(r'PASS:', out3a))
ml_fail = len(re.findall(r'FAIL:', out3a))
p3a, f3a = ml_pass, ml_fail

# 3b — security-hardening (standalone node script)
out3b, rc3b, _ = run(
    "node tests/security-hardening.test.js",
    env_extra={"TEST_BASE_URL": BASE_URL},
    timeout=90
)
sh_pass = len(re.findall(r'PASS:', out3b))
sh_fail = len(re.findall(r'FAIL:', out3b))

# 3c — red-team (standalone node script)
out3c, rc3c, _ = run(
    "node tests/red-team-pentest.test.js",
    env_extra={"TEST_BASE_URL": BASE_URL},
    timeout=180
)
rt_pass = len(re.findall(r'PASS:', out3c))
rt_fail = len(re.findall(r'FAIL:', out3c))

# 3d — blue-team (standalone node script)
out3d, rc3d, _ = run(
    "node tests/blue-team-defense.test.js",
    env_extra={"TEST_BASE_URL": BASE_URL},
    timeout=180
)
bt_pass = len(re.findall(r'PASS:', out3d))
bt_fail = len(re.findall(r'FAIL:', out3d))

# Combine
out3 = out3a + "\n\n--- security-hardening ---\n" + out3b + "\n\n--- red-team ---\n" + out3c + "\n\n--- blue-team ---\n" + out3d
p3 = (p3a or 0) + sh_pass + rt_pass + bt_pass
f3 = (f3a or 0) + sh_fail + rt_fail + bt_fail
rc3 = max(rc3a, rc3b, rc3c, rc3d)
el3 = el3a
save_png(f"Jest Security & Module Tests ({BASE_URL})", out3,
         f"03_jest_security_{NOW}.png", p3, f3, el3)
print(f"  Result: {p3} passed, {f3} failed  (exit {rc3})")

# ─────────────────────────────────────────────────────────────────────────────
# SUITE 4 — Newman (Postman)
# ─────────────────────────────────────────────────────────────────────────────
print("\n🧪 [4/6] Newman / Postman ...")
newman_collection = "Final-Final/tests/postman/tas-postman-collection.json"
newman_out_json   = "Final-Final/tests/postman/results/newman-report-latest.json"
out4, rc4, el4 = run(
    f'newman run "{newman_collection}" '
    f'--env-var "baseUrl={BASE_URL}" '
    f'--reporters cli,json '
    f'--reporter-json-export "{newman_out_json}" '
    f'--delay-request 300',
    timeout=240
)
p4, f4 = parse_newman(out4)
save_png(f"Newman / Postman API Tests ({BASE_URL})", out4,
         f"04_newman_{NOW}.png", p4, f4, el4)
print(f"  Result: {p4} passed, {f4} failed  (exit {rc4})")

# ─────────────────────────────────────────────────────────────────────────────
# SUITE 5 — k6 load test (100 VU only — quick run)
# ─────────────────────────────────────────────────────────────────────────────
print("\n🧪 [5/6] k6 performance test (100 VU scenarios) ...")
k6_exe  = r"C:\Program Files\k6\k6.exe"
k6_file = "Final-Final/tests/k6/k6-perf-test.js"
out5, rc5, el5 = run(
    f'"{k6_exe}" run --env BASE_URL={BASE_URL} "{k6_file}"',
    timeout=300
)
# parse k6 summary
k6_pct, k6_total, k6_fail, k6_rps = parse_k6(out5)
summary = f"checks: {k6_pct:.2f}%" if k6_pct is not None else "checks: ?"
if k6_total is not None: summary += f"  ({k6_total - (k6_fail or 0)}/{k6_total} ok)"
if k6_rps: summary += f"  |  {k6_rps} req/s"
save_png(f"k6 Load Test ({BASE_URL})  —  {summary}", out5,
         f"05_k6_{NOW}.png", elapsed=el5)
print(f"  Result: {summary}  (exit {rc5})")

# ─────────────────────────────────────────────────────────────────────────────
# SUITE 6 — Playwright E2E
# ─────────────────────────────────────────────────────────────────────────────
print("\n🧪 [6/6] Playwright E2E ...")
pw_files = " ".join([
    "e2e/auth-full.spec.ts",
    "e2e/pages.spec.ts",
    "e2e/pages-full.spec.ts",
    "e2e/user.spec.ts",
    "e2e/session.spec.ts",
    "e2e/oauth.spec.ts",
    "e2e/dashboard.spec.ts",
    "e2e/security.spec.ts",
])
out6, rc6, el6 = run(
    f"npx playwright test {pw_files} --project=chromium --reporter=list",
    timeout=300
)
m6p = re.search(r'(\d+) passed', out6)
m6f = re.search(r'(\d+) failed', out6)
p6 = int(m6p.group(1)) if m6p else None
f6 = int(m6f.group(1)) if m6f else 0
save_png(f"Playwright E2E ({BASE_URL})", out6,
         f"06_playwright_{NOW}.png", p6, f6, el6)
print(f"  Result: {p6} passed, {f6} failed  (exit {rc6})")

# ─────────────────────────────────────────────────────────────────────────────
# TEXT SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("FINAL RESULTS")
print("="*60)
_rows = [
    ("test:functions",       p1, f1, rc1),
    ("Jest Integration",     p2, f2, rc2),
    ("Jest Security/Module", p3, f3, rc3),
    ("Newman/Postman",       p4, f4, rc4),
    ("k6 Load Test",         None, None, 0 if (k6_pct is not None and k6_pct >= 99.0) else rc5),
    ("Playwright E2E",       p6, f6, rc6),
]
_all_ok = True
for _name, _p, _f, _rc in _rows:
    if _name == "k6 Load Test":
        _status = "PASS" if (k6_pct is not None and k6_pct >= 99.0) else "FAIL"
        _detail = summary
    elif _p is not None:
        _status = "PASS" if _f == 0 else "FAIL"
        _detail = f"{_p} passed, {_f} failed"
    else:
        _status = "PASS" if _rc == 0 else "FAIL"
        _detail = f"exit {_rc}"
    if _status == "FAIL":
        _all_ok = False
    print(f"  [{_status}] {_name:<25} {_detail}")
print("="*60)
print("ALL PASSED" if _all_ok else "SOME TESTS FAILED — check PNGs in tests/pic/")

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY image
# ─────────────────────────────────────────────────────────────────────────────
print("\n📊 Generating summary image ...")
suites = [
    ("test:functions",        p1, f1, el1, rc1),
    ("Jest Integration",      p2, f2, el2, rc2),
    ("Jest Security/Module",  p3, f3, el3, rc3),
    ("Newman/Postman",        p4, f4, el4, rc4),
    ("k6 Load Test",          None, None, el5, 0 if (k6_pct is not None and k6_pct >= 99.0) else rc5),
    ("Playwright E2E",        p6, f6, el6, rc6),
]

fig, ax = plt.subplots(figsize=(14, 5))
fig.patch.set_facecolor('#1e1e1e')
ax.set_facecolor('#1e1e1e')
ax.axis('off')

ax.text(0.5, 0.97, f"TAS — Full Test Suite Results  |  {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  target: {BASE_URL}",
        transform=ax.transAxes, fontsize=13, fontweight='bold',
        color='#88ccff', ha='center', va='top')

headers = ["Suite", "Passed", "Failed", "Time (s)", "Exit"]
col_x   = [0.02, 0.40, 0.52, 0.64, 0.76]
row_y   = 0.82

# header row
for h, x in zip(headers, col_x):
    ax.text(x, row_y, h, transform=ax.transAxes,
            fontsize=9, fontweight='bold', color='#aaaaaa', va='top')

ax.plot([0.01, 0.99], [row_y - 0.06, row_y - 0.06], color='#444', linewidth=0.8,
        transform=ax.transAxes, clip_on=False)

for i, (name, p, f, el, rc) in enumerate(suites):
    y = row_y - 0.14 - i * 0.11
    ok = (f is not None and f == 0) or (f is None and rc == 0)
    row_color = '#22bb55' if ok else '#ff4444'
    bg_color  = '#1a2e1a' if ok else '#2e1a1a'

    # row background
    ax.add_patch(plt.Rectangle((0.01, y - 0.07), 0.98, 0.10,
                                transform=ax.transAxes, clip_on=False,
                                facecolor=bg_color, edgecolor='none'))

    vals = [
        name,
        str(p) if p is not None else "—",
        str(f) if f is not None else "—",
        f"{el:.0f}s" if el else "—",
        "✅ 0" if rc == 0 else f"❌ {rc}",
    ]
    for val, x in zip(vals, col_x):
        ax.text(x, y, val, transform=ax.transAxes,
                fontsize=9, color=row_color if x == col_x[0] else '#cccccc',
                va='center', fontfamily='monospace' if x != col_x[0] else 'sans-serif')

ax.text(0.99, 0.01, f"tests/pic/  |  {NOW}",
        transform=ax.transAxes, fontsize=6, color='#555555', ha='right', va='bottom')

summary_path = PIC / f"00_SUMMARY_{NOW}.png"
fig.savefig(summary_path, dpi=130, bbox_inches='tight', facecolor=fig.get_facecolor())
plt.close(fig)
print(f"  📸 Saved: {summary_path.name}")

print(f"\n✅ Done — all images saved to: {PIC}")
print(f"   Files: {', '.join(p.name for p in sorted(PIC.glob('*.png')))}")
