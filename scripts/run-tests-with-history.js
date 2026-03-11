#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    mode: 'unknown',
    workers: null,
    config: 'playwright.config.ts',
    historyFile: 'history/test-history.json',
    reportFile: 'test-results/playwright-results.json',
    passthrough: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--mode' && argv[i + 1]) {
      args.mode = String(argv[i + 1]).toLowerCase();
      i += 1;
    } else if (token === '--workers' && argv[i + 1]) {
      args.workers = Number(argv[i + 1]);
      i += 1;
    } else if (token === '--config' && argv[i + 1]) {
      args.config = argv[i + 1];
      i += 1;
    } else if (token === '--history-file' && argv[i + 1]) {
      args.historyFile = argv[i + 1];
      i += 1;
    } else if (token === '--report-file' && argv[i + 1]) {
      args.reportFile = argv[i + 1];
      i += 1;
    } else if (token === '--') {
      args.passthrough = argv.slice(i + 1);
      break;
    } else {
      args.passthrough.push(token);
    }
  }

  return args;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function collectTestsFromSuites(suites, out = []) {
  if (!Array.isArray(suites)) return out;
  for (const suite of suites) {
    if (Array.isArray(suite.specs)) {
      for (const spec of suite.specs) {
        if (Array.isArray(spec.tests)) {
          for (const test of spec.tests) out.push(test);
        }
      }
    }
    if (Array.isArray(suite.suites)) {
      collectTestsFromSuites(suite.suites, out);
    }
  }
  return out;
}

function normalizeTestStatus(test) {
  const outcome = String(test.outcome || '').toLowerCase();
  if (outcome === 'skipped') return 'skipped';
  if (outcome === 'expected' || outcome === 'flaky') return 'passed';
  if (outcome === 'unexpected') return 'failed';

  const results = Array.isArray(test.results) ? test.results : [];
  const last = results.length ? results[results.length - 1] : null;
  const status = String(last?.status || '').toLowerCase();

  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  if (status === 'failed' || status === 'timedout' || status === 'interrupted') return 'failed';

  return 'unknown';
}

function summarizeReport(report) {
  const tests = collectTestsFromSuites(report?.suites || []);

  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMsFromTests = 0;

  for (const test of tests) {
    total += 1;
    const status = normalizeTestStatus(test);
    if (status === 'passed') passed += 1;
    else if (status === 'failed') failed += 1;
    else if (status === 'skipped') skipped += 1;

    const results = Array.isArray(test.results) ? test.results : [];
    for (const result of results) {
      const d = Number(result?.duration);
      if (Number.isFinite(d)) durationMsFromTests += d;
    }
  }

  const statsDuration = Number(report?.stats?.duration);
  const durationMs = Number.isFinite(statsDuration) ? statsDuration : durationMsFromTests;

  return {
    total,
    passed,
    failed,
    skipped,
    durationMs,
    startTime: report?.stats?.startTime,
  };
}

function appendHistory(historyPath, runEntry) {
  let history = { runs: [] };

  if (fs.existsSync(historyPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      if (parsed && Array.isArray(parsed.runs)) {
        history = parsed;
      }
    } catch (error) {
      console.warn(`[history] Could not parse existing history file, recreating: ${historyPath}`);
    }
  }

  history.runs.push(runEntry);
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
}

function createRunId(startTimeIso) {
  const stamp = new Date(startTimeIso).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `run-${stamp}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = path.resolve(process.cwd(), args.reportFile);
  const historyPath = path.resolve(process.cwd(), args.historyFile);

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
  }

  const playwrightArgs = ['playwright', 'test', '--config', args.config];
  if (Number.isFinite(args.workers) && args.workers > 0) {
    playwrightArgs.push('--workers', String(args.workers));
  }
  if (args.passthrough.length) {
    playwrightArgs.push(...args.passthrough);
  }

  const result = spawnSync('npx', playwrightArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
    },
  });

  try {
    const report = readJsonIfExists(reportPath);
    if (!report) {
      console.warn(`[history] Report file not found at ${reportPath}. History not updated.`);
    } else {
      const summary = summarizeReport(report);
      const timestamp = summary.startTime || new Date().toISOString();
      const runEntry = {
        id: createRunId(timestamp),
        timestamp,
        mode: args.mode,
        workers: Number.isFinite(args.workers) ? args.workers : null,
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        durationMs: summary.durationMs,
      };
      appendHistory(historyPath, runEntry);
      console.log(`[history] Appended run metrics to ${historyPath}`);
    }
  } catch (error) {
    console.warn(`[history] Failed to update history: ${error.message}`);
  }

  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  process.exit(exitCode);
}

main();
