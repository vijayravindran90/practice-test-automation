#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { input: null, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if ((token === '--input' || token === '-i') && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
    } else if ((token === '--output' || token === '-o') && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function resolveHistoryPath(cliInput) {
  const candidates = [
    cliInput,
    process.env.REPORT_HISTORY_FILE,
    'history/test-history.json',
    'history/history.json',
    'test-results/history.json',
    'history.json',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolute = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      return absolute;
    }
  }

  const tried = candidates.map((entry) => path.resolve(process.cwd(), entry));
  throw new Error(
    `History file not found. Tried:\n${tried.map((entry) => `- ${entry}`).join('\n')}\n` +
      'Pass --input <path> or set REPORT_HISTORY_FILE.'
  );
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDurationToMs(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|min|h)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 'ms') return amount;
  if (unit === 's') return amount * 1000;
  if (unit === 'm' || unit === 'min') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  return null;
}

function normalizeMode(run, workers) {
  const modeHints = [
    run.mode,
    run.executionMode,
    run.strategy,
    run.type,
    run.label,
    run.command,
    run.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (modeHints.includes('parallel')) return 'parallel';
  if (modeHints.includes('sequential') || modeHints.includes('serial')) return 'sequential';
  if (workers !== null) return workers > 1 ? 'parallel' : 'sequential';
  return 'unknown';
}

function normalizeStatus(raw) {
  const value = String(raw || '').toLowerCase();
  if (value === 'passed' || value === 'pass') return 'passed';
  if (value === 'failed' || value === 'fail' || value === 'timedout' || value === 'timeout') return 'failed';
  if (value === 'skipped' || value === 'skip') return 'skipped';
  return 'unknown';
}

function countsFromTests(tests) {
  if (!Array.isArray(tests) || tests.length === 0) {
    return { passed: null, failed: null, skipped: null, total: null, durationMs: null };
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let known = 0;
  let durationMs = 0;
  let sawDuration = false;

  for (const test of tests) {
    const status = normalizeStatus(test.status || test.result || test.outcome);
    if (status === 'passed') {
      passed += 1;
      known += 1;
    } else if (status === 'failed') {
      failed += 1;
      known += 1;
    } else if (status === 'skipped') {
      skipped += 1;
      known += 1;
    }

    const testDuration =
      parseDurationToMs(test.durationMs) ||
      parseDurationToMs(test.duration) ||
      parseDurationToMs(test.runtimeMs) ||
      parseDurationToMs(test.runtime);
    if (testDuration !== null) {
      durationMs += testDuration;
      sawDuration = true;
    }
  }

  return {
    passed,
    failed,
    skipped,
    total: known > 0 ? known : tests.length,
    durationMs: sawDuration ? durationMs : null,
  };
}

function pickTimestamp(run, index) {
  const candidates = [run.timestamp, run.runStart, run.startTime, run.startedAt, run.createdAt, run.date];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const time = new Date(candidate).getTime();
    if (Number.isFinite(time)) return time;
  }
  return Date.now() + index;
}

function normalizeRun(run, index) {
  const tests = run.tests || run.results || run.testResults;
  const testCounts = countsFromTests(tests);

  const passed =
    safeNumber(run.passed) ??
    safeNumber(run.passedCount) ??
    safeNumber(run.success) ??
    testCounts.passed ??
    0;
  const failed =
    safeNumber(run.failed) ??
    safeNumber(run.failedCount) ??
    safeNumber(run.failures) ??
    testCounts.failed ??
    0;
  const skipped =
    safeNumber(run.skipped) ??
    safeNumber(run.skippedCount) ??
    testCounts.skipped ??
    0;
  const total =
    safeNumber(run.total) ??
    safeNumber(run.totalTests) ??
    safeNumber(run.testCount) ??
    testCounts.total ??
    Math.max(passed + failed + skipped, 0);

  const durationMs =
    parseDurationToMs(run.durationMs) ??
    parseDurationToMs(run.duration) ??
    parseDurationToMs(run.totalDuration) ??
    parseDurationToMs(run.runtimeMs) ??
    parseDurationToMs(run.runtime) ??
    testCounts.durationMs;

  const workers = safeNumber(run.workers) ?? safeNumber(run.concurrency) ?? safeNumber(run.parallelism);
  const mode = normalizeMode(run, workers);
  const timestamp = pickTimestamp(run, index);
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  return {
    id: String(run.id || run.runId || run.buildId || `${index + 1}`),
    timestamp,
    label: run.label || run.name || run.command || `Run ${index + 1}`,
    mode,
    workers,
    total,
    passed,
    failed,
    skipped,
    passRate,
    durationMs,
  };
}

function extractRuns(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const arrayKeys = ['runs', 'history', 'testRuns', 'executions'];
  for (const key of arrayKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (Array.isArray(payload.results)) {
    return [
      {
        id: payload.id || payload.runId || '1',
        timestamp: payload.timestamp || payload.createdAt || new Date().toISOString(),
        tests: payload.results,
      },
    ];
  }

  return [];
}

function formatDuration(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'n/a';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60000).toFixed(1)} min`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

function avg(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTrendSvg(runs) {
  const width = 860;
  const height = 240;
  const left = 56;
  const right = 16;
  const top = 16;
  const bottom = 36;
  const innerW = width - left - right;
  const innerH = height - top - bottom;

  if (runs.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Pass rate trend"><text x="16" y="32">No trend data available</text></svg>`;
  }

  const points = runs.map((run, i) => {
    const x = left + (runs.length === 1 ? innerW / 2 : (i / (runs.length - 1)) * innerW);
    const y = top + ((100 - run.passRate) / 100) * innerH;
    return { x, y, run };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const yTicks = [0, 25, 50, 75, 100]
    .map((tick) => {
      const y = top + ((100 - tick) / 100) * innerH;
      return `<line x1="${left}" y1="${y}" x2="${left + innerW}" y2="${y}" class="grid" /><text x="8" y="${y + 4}" class="axis">${tick}%</text>`;
    })
    .join('');

  const xTicks = points
    .map((p) => {
      const label = new Date(p.run.timestamp).toLocaleDateString();
      return `<text x="${p.x}" y="${height - 10}" text-anchor="middle" class="axis">${escapeHtml(label)}</text>`;
    })
    .join('');

  const dots = points
    .map((p) => {
      const failed = p.run.failed > 0;
      const fill = failed ? '#dc2626' : '#16a34a';
      const title = `${formatDate(p.run.timestamp)} | Pass rate ${p.run.passRate.toFixed(1)}% | Passed ${p.run.passed} | Failed ${p.run.failed}`;
      return `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${fill}"><title>${escapeHtml(title)}</title></circle>`;
    })
    .join('');

  return `
<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Pass rate trend chart">
  <rect x="${left}" y="${top}" width="${innerW}" height="${innerH}" class="plot-bg" />
  ${yTicks}
  <polyline fill="none" stroke="#0f766e" stroke-width="3" points="${polyline}" />
  ${dots}
  ${xTicks}
</svg>`;
}

function buildComparisonSvg(parallelAvg, sequentialAvg) {
  const width = 560;
  const height = 220;
  const left = 60;
  const right = 24;
  const top = 16;
  const bottom = 40;
  const innerW = width - left - right;
  const innerH = height - top - bottom;

  const values = [
    { key: 'Parallel', value: parallelAvg, color: '#0ea5e9' },
    { key: 'Sequential', value: sequentialAvg, color: '#f97316' },
  ];

  const finiteValues = values.map((v) => v.value).filter((v) => Number.isFinite(v));
  if (!finiteValues.length) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Execution mode comparison"><text x="16" y="32">No comparison data available</text></svg>`;
  }

  const maxValue = Math.max(...finiteValues, 1);
  const barWidth = 120;
  const gap = 80;
  const startX = left + (innerW - (barWidth * 2 + gap)) / 2;

  const bars = values
    .map((item, idx) => {
      const x = startX + idx * (barWidth + gap);
      const h = Number.isFinite(item.value) ? (item.value / maxValue) * innerH : 0;
      const y = top + innerH - h;
      const label = Number.isFinite(item.value) ? formatDuration(item.value) : 'n/a';
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${item.color}" rx="10" />
        <text x="${x + barWidth / 2}" y="${top + innerH + 22}" text-anchor="middle" class="axis">${item.key}</text>
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" class="bar-label">${label}</text>
      `;
    })
    .join('');

  return `
<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Average duration by execution mode">
  <rect x="${left}" y="${top}" width="${innerW}" height="${innerH}" class="plot-bg" />
  ${bars}
</svg>`;
}

function buildHtml({ runs, inputPath, generatedAt }) {
  const sorted = [...runs].sort((a, b) => a.timestamp - b.timestamp);
  const totalRuns = sorted.length;
  const totalTests = sorted.reduce((sum, run) => sum + run.total, 0);
  const totalPassed = sorted.reduce((sum, run) => sum + run.passed, 0);
  const totalFailed = sorted.reduce((sum, run) => sum + run.failed, 0);
  const overallPassRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

  const parallelDurations = sorted
    .filter((run) => run.mode === 'parallel' && Number.isFinite(run.durationMs))
    .map((run) => run.durationMs);
  const sequentialDurations = sorted
    .filter((run) => run.mode === 'sequential' && Number.isFinite(run.durationMs))
    .map((run) => run.durationMs);

  const parallelAvg = avg(parallelDurations);
  const sequentialAvg = avg(sequentialDurations);
  const speedup =
    Number.isFinite(parallelAvg) && Number.isFinite(sequentialAvg) && parallelAvg > 0
      ? sequentialAvg / parallelAvg
      : null;

  const trendSvg = buildTrendSvg(sorted);
  const comparisonSvg = buildComparisonSvg(parallelAvg, sequentialAvg);

  const recentRows = [...sorted]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12)
    .map(
      (run) => `
      <tr>
        <td>${escapeHtml(formatDate(run.timestamp))}</td>
        <td>${escapeHtml(run.mode)}</td>
        <td>${run.workers ?? 'n/a'}</td>
        <td>${run.passed}</td>
        <td>${run.failed}</td>
        <td>${run.total}</td>
        <td>${run.passRate.toFixed(1)}%</td>
        <td>${escapeHtml(formatDuration(run.durationMs))}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Automation Summary Report</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --card: #ffffff;
      --text: #14213d;
      --muted: #52616b;
      --border: #d8dee4;
      --good: #15803d;
      --bad: #b91c1c;
      --accent: #0f766e;
      --plot: #eff6ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background:
        radial-gradient(circle at top right, #dbeafe 0, transparent 36%),
        linear-gradient(180deg, #f7fbff 0%, var(--bg) 100%);
      color: var(--text);
      font-family: 'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Segoe UI', sans-serif;
    }
    .layout {
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
      padding: 16px;
    }
    h1, h2 { margin: 0 0 10px; }
    .muted { color: var(--muted); margin: 0; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(140px, 1fr));
      gap: 12px;
    }
    .metric {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
      background: #fbfdff;
    }
    .metric .k { font-size: 12px; color: var(--muted); }
    .metric .v { font-size: 24px; font-weight: 700; }
    .good { color: var(--good); }
    .bad { color: var(--bad); }
    .split {
      display: grid;
      grid-template-columns: 1.25fr 1fr;
      gap: 16px;
    }
    svg { width: 100%; height: auto; }
    .grid { stroke: #d1d5db; stroke-width: 1; }
    .axis { fill: #475569; font-size: 11px; }
    .bar-label { fill: #1e293b; font-size: 12px; font-weight: 700; }
    .plot-bg { fill: var(--plot); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border: 1px solid var(--border);
      padding: 8px;
      text-align: left;
    }
    th {
      background: #eef2ff;
    }
    @media (max-width: 900px) {
      body { padding: 14px; }
      .stats { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .split { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="layout">
    <section class="card">
      <h1>Pass/Fail Trend and Performance Summary</h1>
      <p class="muted">Generated: ${escapeHtml(generatedAt)} | Source: ${escapeHtml(inputPath)}</p>
    </section>

    <section class="card stats">
      <div class="metric"><div class="k">Runs</div><div class="v">${totalRuns}</div></div>
      <div class="metric"><div class="k">Total Tests</div><div class="v">${totalTests}</div></div>
      <div class="metric"><div class="k">Pass Rate</div><div class="v good">${overallPassRate.toFixed(1)}%</div></div>
      <div class="metric"><div class="k">Failures</div><div class="v ${totalFailed > 0 ? 'bad' : 'good'}">${totalFailed}</div></div>
    </section>

    <section class="split">
      <article class="card">
        <h2>Pass/Fail Trend</h2>
        ${trendSvg}
      </article>
      <article class="card">
        <h2>Parallel vs Sequential</h2>
        ${comparisonSvg}
        <p class="muted">
          Parallel avg: ${escapeHtml(formatDuration(parallelAvg))} |
          Sequential avg: ${escapeHtml(formatDuration(sequentialAvg))} |
          ${speedup ? `Estimated speedup: ${speedup.toFixed(2)}x` : 'Speedup: n/a'}
        </p>
      </article>
    </section>

    <section class="card">
      <h2>Recent Runs</h2>
      <table>
        <thead>
          <tr>
            <th>Run Start</th>
            <th>Mode</th>
            <th>Workers</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Total</th>
            <th>Pass Rate</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${recentRows || '<tr><td colspan="8">No run data found</td></tr>'}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolveHistoryPath(args.input);
  const outputPath = path.resolve(process.cwd(), args.output || 'summary.html');

  const raw = fs.readFileSync(inputPath, 'utf8');
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in history file: ${inputPath}. ${error.message}`);
  }

  const extracted = extractRuns(payload);
  const normalized = extracted.map((runData, index) => normalizeRun(runData, index));

  const html = buildHtml({
    runs: normalized,
    inputPath: path.relative(process.cwd(), inputPath) || inputPath,
    generatedAt: new Date().toLocaleString(),
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');

  console.log(`Generated ${outputPath} from ${inputPath} (${normalized.length} runs).`);
}

try {
  run();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
