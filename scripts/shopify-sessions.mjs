// Turns a private Shopify sessions export into the public, indexed trend in
// insights/sessions-trend.csv. Sessions only: no sales, orders or conversion.
//
// Why an import and not an API call from CI: Shopify's reports API needs
// Level 2 protected customer data access (names, emails, addresses), and a
// credential that can read those doesn't belong in a public repo's CI.
// Instead the export is pulled from Shopify by hand (or by Claude with the
// owner's connected Shopify) and fed to this script locally:
//
//   npm run sessions:import -- path/to/export.json
//
// Keep the export OUTSIDE the repo, as it holds raw counts. Its shape:
//   {
//     "baselineSessions": <total sessions in BASELINE>,
//     "days": [{ "date": "YYYY-MM-DD", "direct": n, "social": n, "search": n, "other": n }],
//     "botUsDirect": { "YYYY-MM-DD": n }   // US direct sessions on BOT_WINDOW days
//   }
// Shopify queries that produce it:
//   FROM sessions SHOW sessions SINCE <BASELINE.from> UNTIL <BASELINE.to>
//   FROM sessions SHOW sessions GROUP BY referrer_source TIMESERIES day SINCE <from> UNTIL -1d
//   FROM sessions SHOW sessions WHERE referrer_source = 'direct' AND session_country = 'United States'
//     TIMESERIES day SINCE <BOT_WINDOW.from> UNTIL <BOT_WINDOW.to>
//
// Privacy: only 7-day rolling averages indexed to the baseline (= 100) are
// written. Raw counts and the baseline never leave the export, and the
// rolling average means single-day counts can't be read back out.
import fs from 'node:fs';
import path from 'node:path';
import { readCsv, writeCsv } from './dashboard/csv.mjs';

// A normal month before any of the changes being measured, and before the
// QA suite existed. Changing it rescales the whole history, so don't.
const BASELINE = { from: '2026-08-01', to: '2026-08-31' };

// Days when QA runs were counted as sessions (fixed in PR #11). They showed up
// as US direct traffic, so that slice is left out for these days and the
// days are flagged on the chart. Local runs on 17-18 Sep also added some UK
// direct sessions that can't be separated out.
const BOT_WINDOW = { from: '2026-09-17', to: '2026-09-23' };

const SOURCES = ['direct', 'social', 'search'];
const CSV_PATH = path.join(process.cwd(), 'insights', 'sessions-trend.csv');
const COLUMNS = ['date', 'total', ...SOURCES, 'bot_adjusted'];

const inBotWindow = (date) => date >= BOT_WINDOW.from && date <= BOT_WINDOW.to;

// Export days -> Map(date -> { total, direct, social, search }) with the QA
// bot's US direct sessions taken out.
export function dailyTotals(days, botUsDirect = {}) {
  const out = new Map();
  for (const d of days) {
    const bot = inBotWindow(d.date) ? botUsDirect[d.date] || 0 : 0;
    const direct = (d.direct || 0) - bot;
    const total = direct + (d.social || 0) + (d.search || 0) + (d.other || 0);
    out.set(d.date, { total, direct, social: d.social || 0, search: d.search || 0 });
  }
  return out;
}

// 7-day rolling average, indexed so the baseline daily average = 100. Only
// days with all 7 days present and non-empty are emitted: Shopify's grouped
// data lags a day or two, and an unfinished day would drag the average down.
export function trendRows(days, baselinePerDay) {
  const dates = [...days.keys()].sort();
  const out = [];
  for (let i = 6; i < dates.length; i++) {
    const window = dates.slice(i - 6, i + 1).map((d) => days.get(d));
    if (window.some((d) => d.total === 0)) continue;
    const index = (key) => Math.round((window.reduce((sum, d) => sum + d[key], 0) / 7 / baselinePerDay) * 100);
    out.push({
      date: dates[i],
      total: index('total'),
      direct: index('direct'),
      social: index('social'),
      search: index('search'),
      bot_adjusted: dates.slice(i - 6, i + 1).some(inBotWindow) ? 1 : 0,
    });
  }
  return out;
}

function main() {
  const exportPath = process.argv[2];
  if (!exportPath) throw new Error('Usage: npm run sessions:import -- path/to/export.json');
  if (path.resolve(exportPath).startsWith(process.cwd())) throw new Error('Keep the export outside the repo: it holds raw counts.');

  const exp = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const baselineDays = (new Date(BASELINE.to) - new Date(BASELINE.from)) / 86_400_000 + 1;
  const baselinePerDay = exp.baselineSessions / baselineDays;
  if (!baselinePerDay) throw new Error('Baseline has no sessions');

  const fresh = trendRows(dailyTotals(exp.days, exp.botUsDirect), baselinePerDay);
  const byDate = new Map(readCsv(CSV_PATH).map((r) => [r.date, r]));
  for (const r of fresh) byDate.set(r.date, r);
  writeCsv(CSV_PATH, COLUMNS, [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
  console.log(`Sessions trend: ${fresh.length} days written to insights/sessions-trend.csv.`);
}

if (process.argv[1]?.endsWith('shopify-sessions.mjs')) main();
