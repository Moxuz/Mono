import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

interface SuiteRow {
  suite: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

class SummaryTableReporter implements Reporter {
  private suiteMap = new Map<string, SuiteRow>();
  private startTime = 0;

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startTime = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    let parent: Suite | undefined = test.parent;
    let suiteName = 'Ungrouped';
    while (parent) {
      if (parent.title) { suiteName = parent.title; break; }
      parent = parent.parent;
    }

    if (!this.suiteMap.has(suiteName)) {
      this.suiteMap.set(suiteName, { suite: suiteName, total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 });
    }
    const row = this.suiteMap.get(suiteName)!;
    row.total++;
    row.duration += result.duration;
    if (result.status === 'passed')       row.passed++;
    else if (result.status === 'failed' || result.status === 'timedOut') row.failed++;
    else row.skipped++;
  }

  onEnd(result: FullResult) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const rows = [...this.suiteMap.values()];
    const totals: SuiteRow = rows.reduce(
      (acc, r) => ({
        suite: 'TOTAL',
        total:    acc.total   + r.total,
        passed:   acc.passed  + r.passed,
        failed:   acc.failed  + r.failed,
        skipped:  acc.skipped + r.skipped,
        duration: acc.duration + r.duration,
      }),
      { suite: 'TOTAL', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 }
    );

    const nameW = Math.max(35, ...rows.map(r => r.suite.length));
    const numW  = 7;
    const HR    = '─'.repeat(nameW + numW * 4 + 14);
    const pad   = (s: string | number, w: number) => String(s).padStart(w);
    const padL  = (s: string | number, w: number) => String(s).padEnd(w);
    const passRate = totals.total > 0
      ? ((totals.passed / totals.total) * 100).toFixed(1) + '%'
      : '0.0%';
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const lines: string[] = [];
    const l = (s: string) => lines.push(s);

    l('');
    l('┌' + '─'.repeat(HR.length) + '┐');
    l('│' + ` PLAYWRIGHT TEST SUMMARY  [${now}]`.padEnd(HR.length) + '│');
    l('├' + HR + '┤');
    l('│ ' + padL('Test Suite', nameW) + '  ' + pad('Total', numW) + '  ' + pad('Passed', numW) + '  ' + pad('Failed', numW) + '  ' + pad('Skipped', numW) + ' │');
    l('├' + HR + '┤');
    for (const r of rows) {
      const mark = r.failed > 0 ? ' ✗' : '  ';
      l('│ ' + padL(r.suite, nameW) + '  ' + pad(r.total, numW) + '  ' + pad(r.passed, numW) + '  ' + pad(r.failed, numW) + '  ' + pad(r.skipped, numW) + mark + '│');
    }
    l('├' + HR + '┤');
    l('│ ' + padL('TOTAL', nameW) + '  ' + pad(totals.total, numW) + '  ' + pad(totals.passed, numW) + '  ' + pad(totals.failed, numW) + '  ' + pad(totals.skipped, numW) + '  │');
    l('├' + HR + '┤');
    l('│ ' + padL(`Pass rate: ${passRate}   Duration: ${elapsed}s   Status: ${result.status.toUpperCase()}`, HR.length - 1) + '│');
    l('└' + '─'.repeat(HR.length) + '┘');
    l('');

    // Print to console
    lines.forEach(line => console.log(line));

    // Write to txt file
    const outDir = path.join(__dirname, 'results');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const txtPath = path.join(outDir, 'playwright-results.txt');
    fs.writeFileSync(txtPath, lines.join('\n') + '\n', 'utf8');
    console.log(`  Summary saved -> ${txtPath}\n`);
  }
}

export default SummaryTableReporter;
