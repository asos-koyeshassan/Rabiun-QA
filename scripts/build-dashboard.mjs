// Builds a single static HTML page from:
//  - test-results/results.json  (Playwright's JSON reporter output, this run)
//  - data/run-history.csv       (pass/fail summary appended every run, for history)
//  - data/lighthouse-history.csv (Lighthouse scores over time)
// and writes it to dashboard/index.html for GitHub Pages to publish.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RESULTS_JSON = path.join(ROOT, 'test-results', 'results.json');
const RUN_HISTORY_CSV = path.join(ROOT, 'data', 'run-history.csv');
const LIGHTHOUSE_CSV = path.join(ROOT, 'data', 'lighthouse-history.csv');
const OUT_DIR = path.join(ROOT, 'dashboard');

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const [header, ...lines] = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.filter(Boolean).map((line) => {
    const vals = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
  });
}

function summarizeThisRun() {
  if (!fs.existsSync(RESULTS_JSON)) return { passed: 0, failed: 0, skipped: 0, failures: [] };
  const raw = JSON.parse(fs.readFileSync(RESULTS_JSON, 'utf8'));
  let passed = 0,
    failed = 0,
    skipped = 0;
  const failures = [];

  function walk(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const status = test.results?.[test.results.length - 1]?.status;
        if (status === 'passed') passed++;
        else if (status === 'skipped') skipped++;
        else {
          failed++;
          failures.push(spec.title);
        }
      }
    }
    for (const s of suite.suites || []) walk(s);
  }
  for (const s of raw.suites || []) walk(s);

  return { passed, failed, skipped, failures };
}

function appendRunHistory(summary) {
  fs.mkdirSync(path.dirname(RUN_HISTORY_CSV), { recursive: true });
  const header = 'date,passed,failed,skipped\n';
  if (!fs.existsSync(RUN_HISTORY_CSV)) fs.writeFileSync(RUN_HISTORY_CSV, header);
  const today = new Date().toISOString().slice(0, 10);
  fs.appendFileSync(RUN_HISTORY_CSV, `${today},${summary.passed},${summary.failed},${summary.skipped}\n`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRunHistoryTable(rows) {
  const recent = rows.slice(-30).reverse();
  return `
    <table>
      <thead><tr><th>Date</th><th>Passed</th><th>Failed</th><th>Skipped</th></tr></thead>
      <tbody>
        ${recent
          .map(
            (r) => `<tr class="${Number(r.failed) > 0 ? 'row-fail' : 'row-pass'}">
              <td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.passed)}</td><td>${escapeHtml(r.failed)}</td><td>${escapeHtml(r.skipped)}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function renderLighthouseChart(rows) {
  const pages = [...new Set(rows.map((r) => r.page))];
  const width = 720,
    height = 220,
    pad = 30;
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const xStep = dates.length > 1 ? (width - pad * 2) / (dates.length - 1) : 0;
  const colors = ['#e07a3f', '#3f7ae0', '#3fe0a0', '#c93fe0'];

  const lines = pages
    .map((page, i) => {
      const pageRows = rows.filter((r) => r.page === page && r.performance !== 'ERROR');
      const points = pageRows
        .map((r) => {
          const xi = dates.indexOf(r.date);
          const x = pad + xi * xStep;
          const y = height - pad - (Number(r.performance) / 100) * (height - pad * 2);
          return `${x},${y}`;
        })
        .join(' ');
      return `<polyline points="${points}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="2" />`;
    })
    .join('\n');

  const legend = pages
    .map((page, i) => `<span style="color:${colors[i % colors.length]}">&#9679;</span> ${escapeHtml(page)}`)
    .join('&nbsp;&nbsp;');

  return `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px;background:#111;border-radius:8px">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#444" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#444" />
      ${lines}
    </svg>
    <div style="margin-top:8px;font-size:13px">${legend}</div>`;
}

function main() {
  const summary = summarizeThisRun();
  appendRunHistory(summary);

  const runHistory = readCsv(RUN_HISTORY_CSV);
  const lighthouseHistory = readCsv(LIGHTHOUSE_CSV);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Rabiun QA Dashboard</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; background:#0b0b0c; color:#eee; margin:0; padding:24px; }
  h1 { font-size:20px; margin-bottom:4px; }
  .subtitle { color:#999; font-size:13px; margin-bottom:24px; }
  .status { display:inline-block; padding:4px 10px; border-radius:6px; font-weight:600; font-size:13px; }
  .status-pass { background:#1e3a2a; color:#4ade80; }
  .status-fail { background:#3a1e1e; color:#f87171; }
  section { margin-bottom:32px; }
  table { border-collapse: collapse; width:100%; max-width:600px; font-size:13px; }
  th, td { text-align:left; padding:6px 10px; border-bottom:1px solid #222; }
  .row-fail td { color:#f87171; }
  .row-pass td { color:#ccc; }
  ul.failures { font-size:13px; color:#f87171; }
</style>
</head>
<body>
  <h1>Rabiun QA Dashboard</h1>
  <div class="subtitle">Last run: ${new Date().toISOString()}</div>

  <section>
    <span class="status ${summary.failed > 0 ? 'status-fail' : 'status-pass'}">
      ${summary.failed > 0 ? `${summary.failed} FAILING` : 'ALL PASSING'}
    </span>
    &nbsp; ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped
    ${
      summary.failures.length
        ? `<ul class="failures">${summary.failures.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
        : ''
    }
  </section>

  <section>
    <h2 style="font-size:15px">Pass/fail history (last 30 runs)</h2>
    ${renderRunHistoryTable(runHistory)}
  </section>

  <section>
    <h2 style="font-size:15px">Lighthouse performance trend (mobile, Performance score)</h2>
    ${lighthouseHistory.length ? renderLighthouseChart(lighthouseHistory) : '<p style="color:#999">No Lighthouse data yet.</p>'}
  </section>
</body>
</html>`;

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
  console.log(`Dashboard written to ${path.join(OUT_DIR, 'index.html')}`);
}

main();
