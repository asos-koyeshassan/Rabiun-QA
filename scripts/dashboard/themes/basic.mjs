// The plain dashboard. A theme is a module exporting render(data) -> HTML,
// where data is the object from ../data.mjs (see dashboard/data.json).
// Add a new look by adding a file here; pick it with DASHBOARD_THEME.

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

function renderRunHistoryTable(runs) {
  const recent = runs.slice(-30).reverse();
  return `
    <table>
      <thead><tr><th>Date</th><th>Passed</th><th>Failed</th><th>Skipped</th></tr></thead>
      <tbody>
        ${recent
          .map(
            (r) => `<tr class="${r.failed > 0 ? 'row-fail' : 'row-pass'}">
              <td>${escapeHtml(r.date)}</td><td>${r.passed}</td><td>${r.failed}</td><td>${r.skipped}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function renderLighthouseChart({ pages, history }) {
  const width = 720,
    height = 220,
    pad = 30;
  const dates = [...new Set(history.map((r) => r.date))].sort();
  const xStep = dates.length > 1 ? (width - pad * 2) / (dates.length - 1) : 0;
  const colors = ['#e07a3f', '#3f7ae0', '#3fe0a0', '#c93fe0'];

  const lines = pages
    .map((page, i) => {
      const points = history
        .filter((r) => r.page === page && r.performance != null)
        .map((r) => {
          const x = pad + dates.indexOf(r.date) * xStep;
          const y = height - pad - (r.performance / 100) * (height - pad * 2);
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

export function render(data) {
  const run = data.latestRun || { passed: 0, failed: 0, skipped: 0, checks: [] };
  const failures = run.checks.filter((c) => c.status === 'failed');
  const s = data.stats;

  return `<!doctype html>
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
  .stats { color:#999; font-size:13px; margin-top:10px; }
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
  <div class="subtitle">Last run: ${escapeHtml(data.generatedAt)}</div>

  <section>
    <span class="status ${run.failed > 0 ? 'status-fail' : 'status-pass'}">
      ${run.failed > 0 ? `${run.failed} FAILING` : 'ALL PASSING'}
    </span>
    &nbsp; ${run.passed} passed, ${run.failed} failed, ${run.skipped} skipped
    ${failures.length ? `<ul class="failures">${failures.map((f) => `<li>${escapeHtml(f.name)} (${escapeHtml(f.project)})</li>`).join('')}</ul>` : ''}
    <div class="stats">
      ${s.totalRuns} runs over ${s.daysMonitored} days · ${s.totalChecksRun} checks run ·
      clean-run streak ${s.currentCleanStreak} (best ${s.longestCleanStreak}) ·
      ${pct(s.cleanRunRate30)} of the last 30 runs fully green
    </div>
  </section>

  <section>
    <h2 style="font-size:15px">Pass/fail history (last 30 runs)</h2>
    ${renderRunHistoryTable(data.runHistory)}
  </section>

  <section>
    <h2 style="font-size:15px">Lighthouse performance trend (mobile, Performance score)</h2>
    ${data.lighthouse.history.length ? renderLighthouseChart(data.lighthouse) : '<p style="color:#999">No Lighthouse data yet.</p>'}
  </section>
</body>
</html>`;
}
