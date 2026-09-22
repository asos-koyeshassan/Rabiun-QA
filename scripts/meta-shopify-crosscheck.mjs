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
// bodies.

import fetch from 'node-fetch';

const WINDSOR_API_KEY = process.env.WINDSOR_API_KEY;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g. rabiun.myshopify.com
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

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

async function getShopifyOrderCount(date) {
  const start = `${date}T00:00:00Z`;
  const end = `${date}T23:59:59Z`;
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/orders.json?status=any&created_at_min=${start}&created_at_max=${end}&fields=id`;
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN },
  });
  if (!res.ok) throw new Error(`Shopify API returned ${res.status}`);
  const data = await res.json();
  return (data.orders || []).length;
}

async function main() {
  if (!WINDSOR_API_KEY || !SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
    console.log(
      'Skipping Meta/Shopify cross-check: WINDSOR_API_KEY, SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN not set. ' +
        'This check is optional — the rest of the suite runs fine without it.'
    );
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
  } else {
    console.log(`Cross-check for ${date}: no mismatch detected.`);
  }
}

main().catch((err) => {
  console.error('Cross-check script error:', err.message);
  process.exitCode = 1;
});
