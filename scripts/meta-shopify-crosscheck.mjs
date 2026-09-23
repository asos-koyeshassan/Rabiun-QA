// Cross-checks yesterday's Meta Purchase/AddToCart event counts (via the
// Windsor.ai REST API) against yesterday's actual Shopify order count. If
// Shopify shows orders but Meta shows zero Purchase events, that's a real
// tracking break worth an alert — much stronger evidence than "the pixel
// fired a network request" (tests/pixel.spec.js checks that separately).
//
// Field names (`actions`, `action_type`) follow Windsor's standard Meta Ads
// schema. Verify them against Meta Events Manager on first run and adjust if
// they don't line up. Get an API key from Windsor.ai → Settings → API.
//
// Privacy: this repo is public, and so are its Actions logs. Log only the
// match/mismatch result — never order counts, event counts or API response
// bodies. The same goes for data/tracking-history.csv, which the public
// dashboard reads: one word per run (match / mismatch / error / skipped).

import fetch from 'node-fetch';
import path from 'node:path';
import { appendCsv } from './dashboard/csv.mjs';
import { shopifyConfigured, shopifyGraphql } from './shopify-api.mjs';

const WINDSOR_API_KEY = process.env.WINDSOR_API_KEY;

const HISTORY_CSV = path.join(process.cwd(), 'data', 'tracking-history.csv');

function record(forDate, result) {
  const now = new Date().toISOString();
  appendCsv(HISTORY_CSV, ['date', 'time', 'for_date', 'result'], [
    { date: now.slice(0, 10), time: now.slice(11, 19), for_date: forDate, result },
  ]);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function getMetaEventCounts(date) {
  const url = new URL('https://connectors.windsor.ai/facebook');
  url.searchParams.set('api_key', WINDSOR_API_KEY);
  url.searchParams.set('date_from', date);
  url.searchParams.set('date_to', date);
  url.searchParams.set('fields', 'date,actions,action_values');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Windsor API returned ${res.status}`);
  const data = await res.json();
  const rows = data.data || data || [];

  let purchases = 0;
  let addToCarts = 0;
  for (const row of rows) {
    const actions = row.actions || {};
    purchases += Number(actions.purchase || actions.omni_purchase || 0);
    addToCarts += Number(actions.add_to_cart || actions.omni_add_to_cart || 0);
  }
  return { purchases, addToCarts };
}

// Asks Shopify for a count only: no order records, no customer fields.
async function getShopifyOrderCount(date) {
  const data = await shopifyGraphql('query ($q: String!) { ordersCount(query: $q) { count } }', {
    q: `created_at:>='${date}T00:00:00Z' created_at:<='${date}T23:59:59Z'`,
  });
  return data.ordersCount.count;
}

async function main() {
  if (!WINDSOR_API_KEY || !shopifyConfigured()) {
    console.log(
      'Skipping Meta/Shopify cross-check: WINDSOR_API_KEY, SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET not set. ' +
        'This check is optional — the rest of the suite runs fine without it.'
    );
    record(yesterday(), 'skipped');
    return;
  }

  const date = yesterday();
  const [meta, shopifyOrders] = await Promise.all([getMetaEventCounts(date), getShopifyOrderCount(date)]);

  if (shopifyOrders > 0 && meta.purchases === 0) {
    console.error(
      `MISMATCH on ${date}: Shopify recorded orders but Meta shows 0 Purchase events. ` +
        `Likely a tracking break (or ads are paused) — check Meta Events Manager.`
    );
    process.exitCode = 1; // fails the CI step so it surfaces in the daily email
    record(date, 'mismatch');
  } else {
    console.log(`Cross-check for ${date}: no mismatch detected.`);
    record(date, 'match');
  }
}

main().catch((err) => {
  console.error('Cross-check script error:', err.message);
  process.exitCode = 1;
  record(yesterday(), 'error');
});
