// Daily Shopify sessions TREND for the public dashboard, split by where
// visitors came from (direct / social / search). Sessions only: no sales,
// orders or conversion rate.
//
// Privacy: this repo, its logs and the dashboard are public, and raw session
// counts stay private. Every value written is a 7-day rolling average
// indexed to a fixed baseline (average daily sessions in BASELINE, = 100).
// The baseline is fetched fresh each run and never logged or stored, and the
// rolling average means single-day counts can't be read back out.
//
// Needs SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN (a custom app
// with the read_reports scope). Skips cleanly without them.
import fetch from 'node-fetch';
import path from 'node:path';
import { readCsv, writeCsv } from './dashboard/csv.mjs';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = '2026-07';

// A normal month before any of the changes being measured, and before the
// QA suite existed. Changing it rescales the whole history, so don't.
const BASELINE = { from: '2026-08-01', to: '2026-08-31' };

// Days when QA runs were counted as sessions (fixed in PR #11). They showed up
// as US direct traffic, so that slice is left out for these days and the
// days are flagged on the chart. Local runs on 17-18 Sep also added some UK
// direct sessions that can't be separated out.
const BOT_WINDOW = { from: '2026-09-17', to: '2026-09-23' };

const SOURCES = ['direct', 'social', 'search'];
const CSV_PATH = path.join(process.cwd(), 'data', 'sessions-trend.csv');
const COLUMNS = ['date', 'total', ...SOURCES, 'bot_adjusted'];

async function shopifyql(query) {
  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN },
    body: JSON.stringify({
      query: 'query ($q: String!) { shopifyqlQuery(query: $q) { tableData { rows } parseErrors } }',
      variables: { q: query },
    }),
  });
  if (!res.ok) throw new Error(`Shopify API returned ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`Shopify API error: ${body.errors[0].message}`);
  const result = body.data.shopifyqlQuery;
  if (result.parseErrors?.length) throw new Error(`ShopifyQL parse error: ${result.parseErrors[0]}`);
  return result.tableData.rows;
}

const inBotWindow = (date) => date >= BOT_WINDOW.from && date <= BOT_WINDOW.to;

// rows: [{ day, referrer_source, session_country, sessions }] -> Map(date -> { total, direct, social, search })
export function dailyTotals(rows) {
  const days = new Map();
  for (const r of rows) {
    const date = String(r.day).slice(0, 10);
    const n = Number(r.sessions) || 0;
    const d = days.get(date) || { total: 0, direct: 0, social: 0, search: 0 };
    days.set(date, d);
    if (inBotWindow(date) && r.referrer_source === 'direct' && r.session_country === 'United States') continue;
    d.total += n;
    if (SOURCES.includes(r.referrer_source)) d[r.referrer_source] += n;
  }
  return days;
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

async function main() {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
    console.log('Skipping sessions trend: SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN not set.');
    return;
  }
  const baselineDays = (new Date(BASELINE.to) - new Date(BASELINE.from)) / 86_400_000 + 1;
  const [[baseline], rows] = await Promise.all([
    shopifyql(`FROM sessions SHOW sessions SINCE ${BASELINE.from} UNTIL ${BASELINE.to}`),
    // Re-pull a few weeks every run so days that were still filling in get corrected.
    shopifyql('FROM sessions SHOW sessions GROUP BY referrer_source, session_country TIMESERIES day SINCE -40d UNTIL -1d'),
  ]);
  const baselinePerDay = Number(baseline.sessions) / baselineDays;
  if (!baselinePerDay) throw new Error('Baseline period has no sessions');

  const fresh = trendRows(dailyTotals(rows), baselinePerDay);
  const byDate = new Map(readCsv(CSV_PATH).map((r) => [r.date, r]));
  for (const r of fresh) byDate.set(r.date, r);
  writeCsv(CSV_PATH, COLUMNS, [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
  console.log(`Sessions trend updated (${fresh.length} days refreshed).`);
}

// Only run when called directly, so the helpers above can be imported.
if (process.argv[1]?.endsWith('shopify-sessions.mjs')) {
  main().catch((err) => {
    console.error('Sessions trend error:', err.message);
    process.exitCode = 1;
  });
}
