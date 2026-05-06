"""
generate-summaries.py
Reads existing test result files (Newman JSON, K6 NDJSON, ZAP JSON)
and writes formatted txt summary tables for each, plus a combined summary.

Run from Final-Final/tests/:
    python generate-summaries.py
"""
import json, os, sys
from datetime import datetime

NOW     = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
BASE    = os.path.dirname(os.path.abspath(__file__))

# ── helpers ───────────────────────────────────────────────────────────────────

def avg(v):  return sum(v) / len(v) if v else 0
def p95(v):
    if not v: return 0
    s = sorted(v); i = int(len(s) * 0.95)
    return s[min(i, len(s) - 1)]
def maxv(v): return max(v) if v else 0

def write(path, lines):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = '\n'.join(lines) + '\n'
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f'  Saved -> {path}')
    return text

# ── 1. POSTMAN ────────────────────────────────────────────────────────────────

def build_postman(json_path, txt_path):
    print('\n[Postman]')
    if not os.path.exists(json_path):
        print('  No results file found.')
        return ''
    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)

    run        = data['run']
    stats      = run['stats']
    timings    = run.get('timings', {})
    executions = run.get('executions', [])
    failures   = run.get('failures', [])
    dur_ms     = timings.get('completed', 0) - timings.get('started', 0)

    req_total  = stats['requests']['total']
    req_failed = stats['requests']['failed']
    req_passed = req_total - req_failed
    ass_total  = stats['assertions']['total']
    ass_failed = stats['assertions']['failed']
    ass_passed = ass_total - ass_failed
    rate       = f"{req_passed/req_total*100:.1f}%" if req_total else "0.0%"

    W  = 50
    HR = '-' * (W + 34)
    L  = []
    def l(s): L.append(s)

    l('')
    l('+' + '-' * len(HR) + '+')
    l('| ' + f' POSTMAN / NEWMAN API TEST SUMMARY  [{NOW}]'.ljust(len(HR)) + '|')
    l('+' + '-' * len(HR) + '+')
    l('| ' + 'Category'.ljust(W) + '  ' + 'Total'.rjust(7) + '  ' + 'Passed'.rjust(7) + '  ' + 'Failed'.rjust(7) + ' |')
    l('+' + '-' * len(HR) + '+')
    l('| ' + 'Requests'.ljust(W)   + '  ' + str(req_total).rjust(7) + '  ' + str(req_passed).rjust(7) + '  ' + str(req_failed).rjust(7) + ' |')
    l('| ' + 'Assertions'.ljust(W) + '  ' + str(ass_total).rjust(7) + '  ' + str(ass_passed).rjust(7) + '  ' + str(ass_failed).rjust(7) + ' |')
    l('+' + '-' * len(HR) + '+')
    l('| ' + 'Request Name'.ljust(W) + '  ' + 'Status'.rjust(6) + '  ' + 'Assertions'.rjust(14) + ' |')
    l('+' + '-' * len(HR) + '+')
    for ex in executions:
        name     = ex.get('item', {}).get('name', 'Unknown')[:45]
        method   = ex.get('request', {}).get('method', '')
        resp     = ex.get('response') or {}
        status   = resp.get('code', '?')
        asserts  = ex.get('assertions', [])
        a_total  = len(asserts)
        a_fail   = sum(1 for a in asserts if a.get('error'))
        mark     = ' FAIL' if a_fail else '     '
        l('|   ' + f'[{method}] {name}'.ljust(W) + '  ' + str(status).rjust(6) + '  ' +
          f'{a_total - a_fail}/{a_total} ok'.rjust(14) + mark + '|')
    l('+' + '-' * len(HR) + '+')
    l('| ' + f'Pass rate: {rate}   Duration: {dur_ms/1000:.2f}s   Failures: {len(failures)}'.ljust(len(HR) - 1) + '|')
    l('+' + '-' * len(HR) + '+')
    l('')
    return write(txt_path, L)

# ── 2. K6 ─────────────────────────────────────────────────────────────────────

def build_k6(json_path, txt_path):
    print('\n[K6]')
    if not os.path.exists(json_path):
        print('  No results file found.')
        return ''
    metrics = {}
    with open(json_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try: obj = json.loads(line)
            except: continue
            if obj.get('type') == 'Metric':
                n = obj['data']['name']
                metrics[n] = {'thresholds': obj['data'].get('thresholds', []), 'values': []}
            elif obj.get('type') == 'Point':
                n = obj.get('metric', '')
                if n in metrics:
                    metrics[n]['values'].append(obj['data']['value'])

    key = [
        ('http_reqs',           'Total HTTP Requests',       'count'),
        ('http_req_duration',   'Request Duration p(95)',     'p95_ms'),
        ('http_req_failed',     'Failed Requests (%)',        'avg_pct'),
        ('vus_max',             'Max Virtual Users',          'max'),
        ('http_req_blocked',    'Blocked Time avg (ms)',       'avg_ms'),
        ('http_req_connecting', 'Connecting Time avg (ms)',    'avg_ms'),
        ('http_req_sending',    'Send Time avg (ms)',          'avg_ms'),
        ('http_req_receiving',  'Receive Time avg (ms)',       'avg_ms'),
        ('iterations',          'Total Iterations',           'count'),
    ]

    W  = 40
    HR = '-' * (W + 36)
    L  = []
    def l(s): L.append(s)

    l('')
    l('+' + '-' * len(HR) + '+')
    l('| ' + f' K6 PERFORMANCE TEST SUMMARY  [{NOW}]'.ljust(len(HR)) + '|')
    l('+' + '-' * len(HR) + '+')
    l('| ' + 'Metric'.ljust(W) + '  ' + 'Value'.rjust(14) + '  ' + 'Threshold'.rjust(16) + ' |')
    l('+' + '-' * len(HR) + '+')
    for mn, label, fmt in key:
        if mn not in metrics: continue
        vals   = metrics[mn]['values']
        thresh = ', '.join(metrics[mn]['thresholds']) or '--'
        if   fmt == 'count':   vs = f"{int(sum(vals))}"
        elif fmt == 'p95_ms':  vs = f"{p95(vals):.1f} ms"
        elif fmt == 'avg_pct': vs = f"{avg(vals)*100:.2f}%"
        elif fmt == 'max':     vs = f"{int(maxv(vals))}"
        else:                  vs = f"{avg(vals):.2f} ms"
        l('| ' + label.ljust(W) + '  ' + vs.rjust(14) + '  ' + thresh.rjust(16) + ' |')
    l('+' + '-' * len(HR) + '+')
    l('')
    return write(txt_path, L)

# ── 3. ZAP ────────────────────────────────────────────────────────────────────

def build_zap(json_path, txt_path):
    print('\n[ZAP]')
    if not os.path.exists(json_path):
        print('  No results file found.')
        return ''
    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)

    sites      = data.get('site', [])
    all_alerts = []
    for s in sites: all_alerts.extend(s.get('alerts', []))

    risk_map  = {'3': 'High', '2': 'Medium', '1': 'Low', '0': 'Informational'}
    by_risk   = {'High': [], 'Medium': [], 'Low': [], 'Informational': []}
    for a in all_alerts:
        risk = risk_map.get(str(a.get('riskcode', '')), 'Informational')
        by_risk[risk].append(a)

    W  = 48
    HR = '-' * (W + 22)
    L  = []
    def l(s): L.append(s)

    l('')
    l('+' + '-' * len(HR) + '+')
    l('| ' + f' ZAP SECURITY SCAN SUMMARY  [{NOW}]'.ljust(len(HR)) + '|')
    l('+' + '-' * len(HR) + '+')
    l('| ' + 'Risk Level'.ljust(15) + '  ' + 'Count'.rjust(5) + '  ' + 'Alerts'.ljust(W - 24) + ' |')
    l('+' + '-' * len(HR) + '+')
    total = 0
    for risk in ['High', 'Medium', 'Low', 'Informational']:
        group = by_risk.get(risk, [])
        count = len(group)
        total += count
        names = ', '.join(a.get('name', a.get('alert', '?'))[:30] for a in group[:3])
        if len(group) > 3: names += f' (+{len(group)-3} more)'
        mark = ' !' if risk in ('High', 'Medium') else '  '
        l('| ' + risk.ljust(15) + '  ' + str(count).rjust(5) + '  ' +
          names[:W - 24].ljust(W - 24) + mark + '|')
    l('+' + '-' * len(HR) + '+')
    host = sites[0].get('@host', '?') if sites else '?'
    l('| ' + f'Total alerts: {total}   Host: {host}   Generated: {data.get("@generated","?")}'.ljust(len(HR) - 1) + '|')
    l('+' + '-' * len(HR) + '+')
    l('')
    l('  ALERT DETAILS:')
    l('  ' + '-' * 65)
    for risk in ['High', 'Medium', 'Low', 'Informational']:
        for a in by_risk.get(risk, []):
            name  = a.get('name', a.get('alert', 'Unknown'))
            count = a.get('count', len(a.get('instances', [])))
            l(f'  [{risk:13}] {name} (instances: {count})')
    l('')
    return write(txt_path, L)

# ── 4. JEST ───────────────────────────────────────────────────────────────────

def build_jest(json_path, txt_path):
    print('\n[Jest]')
    if not os.path.exists(json_path):
        print('  No results file found.')
        return ''

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
    l('| ' + f' JEST INTEGRATION TEST SUMMARY  [{NOW}]'.ljust(len(HR)) + '|')
    l('+' + '-' * len(HR) + '+')
    l('| ' + 'Suite (File)'.ljust(W) + '  ' + 'Total'.rjust(5) + '  ' + 'Pass'.rjust(5) + '  ' + 'Fail'.rjust(5) + '  ' + 'Skip'.rjust(5) + ' |')
    l('+' + '-' * len(HR) + '+')

    for suite in data.get('testResults', []):
        # Jest JSON uses 'name' for file path and 'assertionResults' for test list
        fname  = os.path.basename(suite.get('name', suite.get('testFilePath', 'unknown')))[:48]
        tests  = suite.get('assertionResults', suite.get('testResults', []))
        s_tot  = len(tests)
        s_pass = sum(1 for t in tests if t.get('status') == 'passed')
        s_fail = sum(1 for t in tests if t.get('status') == 'failed')
        s_skip = sum(1 for t in tests if t.get('status') in ('pending', 'skipped', 'todo'))
        mark   = ' FAIL' if s_fail else '     '
        l('| ' + fname.ljust(W) + '  ' + str(s_tot).rjust(5) + '  ' + str(s_pass).rjust(5) +
          '  ' + str(s_fail).rjust(5) + '  ' + str(s_skip).rjust(5) + mark + ' |')

    l('+' + '-' * len(HR) + '+')

    failed_tests = []
    for suite in data.get('testResults', []):
        for t in suite.get('assertionResults', suite.get('testResults', [])):
            if t.get('status') == 'failed':
                name = ' > '.join(t.get('ancestorTitles', []) + [t.get('title', '?')])
                failed_tests.append(name[:W + 20])

    if failed_tests:
        l('| ' + 'FAILED TESTS:'.ljust(len(HR) - 1) + '|')
        for ft in failed_tests:
            l('|   x ' + ft[:len(HR) - 6].ljust(len(HR) - 6) + '|')
        l('+' + '-' * len(HR) + '+')

    l('| ' + f'Total: {total}  Passed: {passed}  Failed: {failed}  Skipped: {skipped}  Pass rate: {rate}  Duration: {dur_s:.1f}s'.ljust(len(HR) - 1) + '|')
    l('+' + '-' * len(HR) + '+')
    l('')
    return write(txt_path, L)

# ── 5. COMBINED ───────────────────────────────────────────────────────────────

def build_combined(sections, out_path):
    print('\n[Combined Summary]')
    HR = '=' * 80
    L  = []
    def l(s): L.append(s)

    l(HR)
    l('  TAS — COMPLETE TEST SUITE RESULTS')
    l(f'  Generated: {NOW}')
    l(HR)
    l('')
    for txt_path, label in sections:
        l('-' * 80)
        l(f'  {label}')
        l('-' * 80)
        if os.path.exists(txt_path):
            with open(txt_path, encoding='utf-8') as f:
                l(f.read())
        else:
            l(f'  [No results file: {txt_path}]')
        l('')

    write(out_path, L)

# ── main ──────────────────────────────────────────────────────────────────────

def p(rel): return os.path.join(BASE, rel)

jest_txt = build_jest(
    p('jest/results/jest-results.json'),
    p('jest/results/jest-results.txt'))

postman_txt = build_postman(
    p('postman/results/newman-report-latest.json'),
    p('postman/results/postman-results.txt'))

k6_txt = build_k6(
    p('k6/results/k6-results.json'),
    p('k6/results/k6-results.txt'))

zap_txt = build_zap(
    p('zap/results/zap-baseline-report.json'),
    p('zap/results/zap-results.txt'))

# Playwright txt is written by summary-reporter.ts automatically
pw_txt = p('playwright/results/playwright-results.txt')

build_combined([
    (p('jest/results/jest-results.txt'),          'JEST INTEGRATION TESTS'),
    (pw_txt,                                      'PLAYWRIGHT E2E TESTS'),
    (p('postman/results/postman-results.txt'),     'POSTMAN API TESTS'),
    (p('k6/results/k6-results.txt'),              'K6 PERFORMANCE TESTS'),
    (p('zap/results/zap-results.txt'),            'ZAP SECURITY SCAN'),
], p('all-results-summary.txt'))

print('\nDone. Files written:')
print('  jest/results/jest-results.txt')
print('  playwright/results/playwright-results.txt')
print('  postman/results/postman-results.txt')
print('  k6/results/k6-results.txt')
print('  zap/results/zap-results.txt')
print('  all-results-summary.txt')
