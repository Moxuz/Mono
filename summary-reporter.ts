import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';

interface SuiteRow {
  suite: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

class SummaryTableReporter implements Reporter {
  private rows: SuiteRow[] = [];
  private suiteMap = new Map<string, SuiteRow>();
  private startTime = 0;

  onBegin(_config: FullConfig, suite: Suite) {
    this.startTime = Date.now();
    // Pre-register top-level describe suites
    for (const s of suite.suites) {
      for (const child of s.suites) {
        const key = child.title || s.title;
        if (!this.suiteMap.has(key)) {
          this.suiteMap.set(key, { suite: key, total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 });
        }
      }
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Walk up to find the describe() title
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

    // Totals
    const totals: SuiteRow = rows.reduce(
      (acc, r) => ({
        suite: 'TOTAL',
        total:   acc.total   + r.total,
        passed:  acc.passed  + r.passed,
        failed:  acc.failed  + r.failed,
        skipped: acc.skipped + r.skipped,
        duration: acc.duration + r.duration,
      }),
      { suite: 'TOTAL', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 }
    );

    // Column widths
    const nameW  = Math.max(30, ...rows.map(r => r.suite.length), 5);
    const numW   = 7;

    const line  = (s: string) => console.log(s);
    const pad   = (s: string | number, w: number) => String(s).padStart(w);
    const padL  = (s: string | number, w: number) => String(s).padEnd(w);
    const HR    = '─'.repeat(nameW + numW * 4 + 14);

    line('');
    line('┌' + '─'.repeat(HR.length) + '┐');
    line('│' + ' PLAYWRIGHT TEST SUMMARY'.padEnd(HR.length) + '│');
    line('├' + HR + '┤');
    line(
      '│ ' +
      padL('Test Suite',   nameW) + '  ' +
      pad('Total', numW)  + '  ' +
      pad('Passed', numW) + '  ' +
      pad('Failed', numW) + '  ' +
      pad('Skipped', numW) +
      ' │'
    );
    line('├' + HR + '┤');

    for (const r of rows) {
      const failMark = r.failed > 0 ? ' ✗' : '  ';
      line(
        '│ ' +
        padL(r.suite, nameW) + '  ' +
        pad(r.total,   numW) + '  ' +
        pad(r.passed,  numW) + '  ' +
        pad(r.failed,  numW) + '  ' +
        pad(r.skipped, numW) +
        failMark + '│'
      );
    }

    line('├' + HR + '┤');
    const passRate = totals.total > 0
      ? ((totals.passed / totals.total) * 100).toFixed(1) + '%'
      : '—';

    line(
      '│ ' +
      padL('TOTAL', nameW) + '  ' +
      pad(totals.total,   numW) + '  ' +
      pad(totals.passed,  numW) + '  ' +
      pad(totals.failed,  numW) + '  ' +
      pad(totals.skipped, numW) +
      '  │'
    );
    line('├' + HR + '┤');
    line(
      '│ ' +
      padL(`Pass rate: ${passRate}   Duration: ${elapsed}s   Status: ${result.status.toUpperCase()}`, HR.length - 1) +
      '│'
    );
    line('└' + '─'.repeat(HR.length) + '┘');
    line('');
  }
}

export default SummaryTableReporter;
