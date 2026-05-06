#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-all-tests.sh  —  Run all TAS test suites and save results to txt files
#
# Usage (from Final-Final/tests/):
#   bash run-all-tests.sh
#
# Output files:
#   jest/results/jest-results.json
#   jest/results/jest-results.txt
#   playwright/results/playwright-results.txt
#   postman/results/postman-results.txt
#   k6/results/k6-results.txt
#   zap/results/zap-results.txt
#   all-results-summary.txt
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$TESTS_DIR/../.." && pwd)"
NOW="$(date '+%Y-%m-%d %H:%M:%S')"

HR="════════════════════════════════════════════════════════════"

log() { echo -e "\n$HR\n  $1\n$HR"; }

# ─── 1. JEST UNIT / INTEGRATION TESTS ───────────────────────────────────────
log "Running Jest Integration Tests..."
JEST_DIR="$TESTS_DIR/jest"
JEST_JSON="$JEST_DIR/results/jest-results.json"
JEST_TXT="$JEST_DIR/results/jest-results.txt"
mkdir -p "$JEST_DIR/results"

cd "$ROOT_DIR"
npx jest --config "$JEST_DIR/jest.config.js" \
  --runInBand \
  --json --outputFile "$JEST_JSON" \
  2>&1 | tee /tmp/jest-output.txt || true

python3 - "$JEST_JSON" "$JEST_TXT" "$NOW" <<'PYEOF'
import json, sys, os

json_path, txt_path, now = sys.argv[1], sys.argv[2], sys.argv[3]
if not os.path.exists(json_path):
    print('  No Jest results file found.')
    sys.exit(0)

with open(json_path, encoding='utf-8') as f:
    data = json.load(f)

total   = data.get('numTotalTests', 0)
passed  = data.get('numPassedTests', 0)
failed  = data.get('numFailedTests', 0)
skipped = data.get('numPendingTests', 0)
dur_s   = sum(r.get('perfStats', {}).get('runtime', 0) for r in data.get('testResults', [])) / 1000
rate    = f"{passed/total*100:.1f}%" if total else "0.0%"

W  = 52
HR = '-' * (W + 34)
L  = []
def l(s): L.append(s)

l('')
l('+' + '-' * len(HR) + '+')
l('| ' + f' JEST INTEGRATION TEST SUMMARY  [{now}]'.ljust(len(HR)) + '|')
l('+' + '-' * len(HR) + '+')
l('| ' + 'Suite (File)'.ljust(W) + '  ' + 'Total'.rjust(5) + '  ' + 'Pass'.rjust(5) + '  ' + 'Fail'.rjust(5) + '  ' + 'Skip'.rjust(5) + ' |')
l('+' + '-' * len(HR) + '+')

for suite in data.get('testResults', []):
    fname  = os.path.basename(suite.get('testFilePath', 'unknown'))[:48]
    tests  = suite.get('testResults', [])
    s_tot  = len(tests)
    s_pass = sum(1 for t in tests if t.get('status') == 'passed')
    s_fail = sum(1 for t in tests if t.get('status') == 'failed')
    s_skip = sum(1 for t in tests if t.get('status') in ('pending', 'skipped', 'todo'))
    mark   = ' FAIL' if s_fail else '     '
    l('| ' + fname.ljust(W) + '  ' + str(s_tot).rjust(5) + '  ' + str(s_pass).rjust(5) +
      '  ' + str(s_fail).rjust(5) + '  ' + str(s_skip).rjust(5) + mark + ' |')

l('+' + '-' * len(HR) + '+')

# Per-suite failed test details
failed_tests = []
for suite in data.get('testResults', []):
    for t in suite.get('testResults', []):
        if t.get('status') == 'failed':
            name = ' > '.join(t.get('ancestorTitles', []) + [t.get('title', '?')])
            failed_tests.append(name[:W + 20])

if failed_tests:
    l('| ' + 'FAILED TESTS:'.ljust(len(HR) - 1) + '|')
    for ft in failed_tests:
        l('|   ✗ ' + ft[:len(HR) - 6].ljust(len(HR) - 6) + '|')
    l('+' + '-' * len(HR) + '+')

l('| ' + f'Total: {total}  Passed: {passed}  Failed: {failed}  Skipped: {skipped}  Pass rate: {rate}  Duration: {dur_s:.1f}s'.ljust(len(HR) - 1) + '|')
l('+' + '-' * len(HR) + '+')
l('')

text = '\n'.join(L) + '\n'
print(text)
with open(txt_path, 'w', encoding='utf-8') as f:
    f.write(text)
print(f"Jest results saved -> {txt_path}")
PYEOF

echo "Jest results saved -> $JEST_TXT"
cd "$TESTS_DIR"

# ─── 2. PLAYWRIGHT E2E ───────────────────────────────────────────────────────
log "Running Playwright E2E Tests..."
PW_DIR="$TESTS_DIR/playwright"
PW_TXT="$PW_DIR/results/playwright-results.txt"
mkdir -p "$PW_DIR/results"

cd "$PW_DIR"
npx playwright test 2>&1 | tee /tmp/pw-output.txt
# summary-reporter.ts writes playwright-results.txt automatically
echo "Playwright results saved -> $PW_TXT"
cd "$TESTS_DIR"

# ─── 3. POSTMAN / NEWMAN ─────────────────────────────────────────────────────
log "Running Postman/Newman API Tests..."
PM_DIR="$TESTS_DIR/postman"
PM_JSON="$PM_DIR/results/newman-report-latest.json"
PM_TXT="$PM_DIR/results/postman-results.txt"
mkdir -p "$PM_DIR/results"

cd "$PM_DIR"
npx newman run tas-postman-collection.json \
  --env-var "baseUrl=http://localhost" \
  --reporters cli,json \
  --reporter-json-export results/newman-report-latest.json \
  2>&1 | tee /tmp/pm-output.txt || true

# Parse JSON and write summary table
python3 - "$PM_JSON" "$PM_TXT" "$NOW" <<'PYEOF'
import json, sys

json_path, txt_path, now = sys.argv[1], sys.argv[2], sys.argv[3]
with open(json_path, encoding='utf-8') as f:
    data = json.load(f)

run     = data['run']
stats   = run['stats']
timings = run.get('timings', {})
executions = run.get('executions', [])
failures   = run.get('failures', [])
duration_ms = timings.get('completed', 0) - timings.get('started', 0)

req_total  = stats['requests']['total']
req_failed = stats['requests']['failed']
req_passed = req_total - req_failed
ass_total  = stats['assertions']['total']
ass_failed = stats['assertions']['failed']
ass_passed = ass_total - ass_failed
pass_rate  = f"{(req_passed/req_total*100):.1f}%" if req_total else "0.0%"

W = 55
HR = '─' * (W + 32)

lines = []
l = lines.append
l('')
l('┌' + '─' * len(HR) + '┐')
l('│' + f' POSTMAN / NEWMAN API TEST SUMMARY  [{now}]'.ljust(len(HR)) + '│')
l('├' + HR + '┤')
l('│ ' + 'Category'.ljust(W) + '  ' + 'Total'.rjust(7) + '  ' + 'Passed'.rjust(7) + '  ' + 'Failed'.rjust(7) + ' │')
l('├' + HR + '┤')
l('│ ' + 'Requests'.ljust(W) + '  ' + str(req_total).rjust(7) + '  ' + str(req_passed).rjust(7) + '  ' + str(req_failed).rjust(7) + ' │')
l('│ ' + 'Assertions'.ljust(W) + '  ' + str(ass_total).rjust(7) + '  ' + str(ass_passed).rjust(7) + '  ' + str(ass_failed).rjust(7) + ' │')
l('├' + HR + '┤')

# Per-request rows
for ex in executions:
    name   = ex.get('item', {}).get('name', 'Unknown')[:50]
    method = ex.get('request', {}).get('method', '')
    status = (ex.get('response') or {}).get('code', '?')
    asserts = ex.get('assertions', [])
    a_total = len(asserts)
    a_fail  = sum(1 for a in asserts if a.get('error'))
    mark    = ' ✗' if a_fail else '  '
    l('│   ' + f'[{method}] {name}'.ljust(W) + '  ' + str(status).rjust(3) + '  ' +
      f'{a_total-a_fail}/{a_total} asserts'.rjust(14) + mark + '│')

l('├' + HR + '┤')
l('│ ' + f'Pass rate: {pass_rate}   Duration: {duration_ms/1000:.2f}s   Failures: {len(failures)}'.ljust(len(HR)-1) + '│')
l('└' + '─' * len(HR) + '┘')
l('')

text = '\n'.join(lines) + '\n'
print(text)
with open(txt_path, 'w', encoding='utf-8') as f:
    f.write(text)
print(f"Postman results saved -> {txt_path}")
PYEOF
cd "$TESTS_DIR"

# ─── 4. K6 PERFORMANCE ───────────────────────────────────────────────────────
log "Running K6 Performance Tests..."
K6_DIR="$TESTS_DIR/k6"
K6_JSON="$K6_DIR/results/k6-results.json"
K6_TXT="$K6_DIR/results/k6-results.txt"
mkdir -p "$K6_DIR/results"

K6_BIN="${K6_BIN:-/c/Program Files/k6/k6.exe}"
"$K6_BIN" run \
  --env BASE_URL=http://localhost \
  --out json="$K6_JSON" \
  "$K6_DIR/k6-perf-test.js" \
  2>&1 | tee /tmp/k6-output.txt || true

python3 - "$K6_JSON" "$K6_TXT" "$NOW" <<'PYEOF'
import json, sys

json_path, txt_path, now = sys.argv[1], sys.argv[2], sys.argv[3]

metrics = {}
with open(json_path, encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except:
            continue
        if obj.get('type') == 'Metric':
            name = obj['data']['name']
            metrics[name] = {'type': obj['data']['type'], 'thresholds': obj['data'].get('thresholds', []), 'values': [], 'pass': True}
        elif obj.get('type') == 'Point':
            name = obj.get('metric', '')
            if name in metrics:
                metrics[name]['values'].append(obj['data']['value'])

def avg(vals): return sum(vals)/len(vals) if vals else 0
def p95(vals):
    if not vals: return 0
    s = sorted(vals)
    i = int(len(s)*0.95)
    return s[min(i, len(s)-1)]
def maxv(vals): return max(vals) if vals else 0

key_metrics = [
    ('http_reqs',           'Total HTTP Requests',     'count'),
    ('http_req_duration',   'Request Duration p(95)',   'p95_ms'),
    ('http_req_failed',     'Failed Requests %',        'avg_pct'),
    ('vus_max',             'Max VUs',                  'max'),
    ('http_req_blocked',    'Blocked Time avg (ms)',     'avg_ms'),
    ('http_req_connecting', 'Connecting Time avg (ms)', 'avg_ms'),
]

W = 40
HR = '─' * (W + 32)
lines = []
l = lines.append
l('')
l('┌' + '─' * len(HR) + '┐')
l('│' + f' K6 PERFORMANCE TEST SUMMARY  [{now}]'.ljust(len(HR)) + '│')
l('├' + HR + '┤')
l('│ ' + 'Metric'.ljust(W) + '  ' + 'Value'.rjust(12) + '  ' + 'Threshold'.rjust(14) + ' │')
l('├' + HR + '┤')

for metric_name, label, fmt in key_metrics:
    if metric_name not in metrics:
        continue
    vals = metrics[metric_name]['values']
    thresh = ', '.join(metrics[metric_name]['thresholds']) or '—'
    if fmt == 'count':
        val_str = f"{int(sum(vals))}"
    elif fmt == 'p95_ms':
        val_str = f"{p95(vals):.1f} ms"
    elif fmt == 'avg_pct':
        val_str = f"{avg(vals)*100:.2f}%"
    elif fmt == 'max':
        val_str = f"{int(maxv(vals))}"
    else:
        val_str = f"{avg(vals):.2f} ms"
    l('│ ' + label.ljust(W) + '  ' + val_str.rjust(12) + '  ' + thresh.rjust(14) + ' │')

l('└' + '─' * len(HR) + '┘')
l('')

text = '\n'.join(lines) + '\n'
print(text)
with open(txt_path, 'w', encoding='utf-8') as f:
    f.write(text)
print(f"K6 results saved -> {txt_path}")
PYEOF

# ─── 5. ZAP SECURITY ─────────────────────────────────────────────────────────
log "Running OWASP ZAP Security Scan (~8 min)..."
ZAP_DIR="$TESTS_DIR/zap"
ZAP_JSON="$ZAP_DIR/results/zap-baseline-report.json"
ZAP_TXT="$ZAP_DIR/results/zap-results.txt"
mkdir -p "$ZAP_DIR/results"

docker run --rm \
  --network testmono_auth-network \
  -v "$(cd "$ZAP_DIR/results" && pwd):/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
    -t http://nginx \
    -r zap-baseline-report.html \
    -J zap-baseline-report.json \
    -m 2 -I \
  2>&1 | tee /tmp/zap-output.txt || true

python3 - "$ZAP_JSON" "$ZAP_TXT" "$NOW" <<'PYEOF'
import json, sys

json_path, txt_path, now = sys.argv[1], sys.argv[2], sys.argv[3]
with open(json_path, encoding='utf-8') as f:
    data = json.load(f)

sites  = data.get('site', [])
alerts = []
for site in sites:
    alerts.extend(site.get('alerts', []))

risk_map = {'3': 'High', '2': 'Medium', '1': 'Low', '0': 'Informational'}
risk_order = {'High': 0, 'Medium': 1, 'Low': 2, 'Informational': 3, 'Unknown': 4}
by_risk = {'High': [], 'Medium': [], 'Low': [], 'Informational': []}

for a in alerts:
    code = str(a.get('riskcode', ''))
    risk = risk_map.get(code, 'Informational')
    by_risk.setdefault(risk, []).append(a)

W = 45
HR = '─' * (W + 22)
lines = []
l = lines.append
l('')
l('┌' + '─' * len(HR) + '┐')
l('│' + f' ZAP SECURITY SCAN SUMMARY  [{now}]'.ljust(len(HR)) + '│')
l('├' + HR + '┤')
l('│ ' + 'Risk Level'.ljust(15) + '  ' + 'Count'.rjust(5) + '  ' + 'Alert Names'.ljust(W - 23) + ' │')
l('├' + HR + '┤')

total = 0
for risk in ['High', 'Medium', 'Low', 'Informational']:
    group = by_risk.get(risk, [])
    count = len(group)
    total += count
    names = ', '.join(a.get('name', a.get('alert', '?'))[:30] for a in group[:3])
    if len(group) > 3:
        names += f' (+{len(group)-3} more)'
    mark = ' !' if risk in ('High', 'Medium') else '  '
    l('│ ' + risk.ljust(15) + '  ' + str(count).rjust(5) + '  ' + names[:W-23].ljust(W-23) + mark + '│')

l('├' + HR + '┤')
l('│ ' + f'Total alerts: {total}   Generated: {data.get("@generated","?")}   Host: {sites[0].get("@host","?") if sites else "?"}' .ljust(len(HR)-1) + '│')
l('└' + '─' * len(HR) + '┘')

# Detail per alert
l('')
l('  ALERT DETAILS:')
l('  ' + '─' * 60)
for risk in ['High', 'Medium', 'Low', 'Informational']:
    for a in by_risk.get(risk, []):
        name = a.get('name', a.get('alert', 'Unknown'))
        conf = a.get('confidence', '?')
        desc = risk_map.get(str(a.get('riskcode','')), 'Info')
        count = a.get('count', len(a.get('instances', [])))
        l(f'  [{desc:13}] {name} (instances: {count})')
l('')

text = '\n'.join(lines) + '\n'
print(text)
with open(txt_path, 'w', encoding='utf-8') as f:
    f.write(text)
print(f"ZAP results saved -> {txt_path}")
PYEOF

# ─── 6. COMBINED SUMMARY ─────────────────────────────────────────────────────
log "Building combined summary..."
SUMMARY_TXT="$TESTS_DIR/all-results-summary.txt"

python3 - "$TESTS_DIR" "$NOW" "$SUMMARY_TXT" <<'PYEOF'
import os, sys, json

tests_dir, now, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

sections = [
    ('jest/results/jest-results.txt',             'JEST INTEGRATION TESTS'),
    ('playwright/results/playwright-results.txt', 'PLAYWRIGHT E2E'),
    ('postman/results/postman-results.txt',       'POSTMAN API'),
    ('k6/results/k6-results.txt',                 'K6 PERFORMANCE'),
    ('zap/results/zap-results.txt',               'ZAP SECURITY'),
]

HR = '=' * 80
lines = []
l = lines.append
l(HR)
l(f'  TAS TEST SUITE — COMBINED RESULTS')
l(f'  Generated: {now}')
l(HR)
l('')

for rel_path, label in sections:
    full_path = os.path.join(tests_dir, rel_path)
    l(f'{"─"*80}')
    l(f'  {label}')
    l(f'{"─"*80}')
    if os.path.exists(full_path):
        with open(full_path, encoding='utf-8') as f:
            l(f.read())
    else:
        l(f'  [No results file found at {full_path}]')
    l('')

text = '\n'.join(lines) + '\n'
print(text)
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(text)
print(f"\nCombined summary saved -> {out_path}")
PYEOF

echo ""
echo "$HR"
echo "  All tests complete. Result files:"
echo "  - jest/results/jest-results.txt"
echo "  - playwright/results/playwright-results.txt"
echo "  - postman/results/postman-results.txt"
echo "  - k6/results/k6-results.txt"
echo "  - zap/results/zap-results.txt"
echo "  - all-results-summary.txt"
echo "$HR"
