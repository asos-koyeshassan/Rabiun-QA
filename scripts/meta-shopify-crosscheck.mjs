// Cross-checks yesterday's Meta Purchase/AddToCart event counts (via the
// Windsor.ai REST API) against yesterday's actual Shopify order count. If
// Shopify shows orders but Meta shows zero Purchase events, that's a real
// tracking break worth an alert — much stronger evidence than "the pixel
// fired a network request" (tests/pixel.spec.js checks that separately).
//
// IMPORTANT — this needs a calibration pass before you trust it:
// I built this against Windsor.ai's documented REST API shape
// (https://connectors.windsor.ai/<connector>?api_key=...&fields=...&date_from=...&date_to=...),
// using the account already connected in your Rabiun project ("Rabiun Primary
// Ads", facebook connector, account id 3568812379926749). I do NOT have a
// Windsor API key to actually run this against, so the field names below
// (`actions`, `action_type`) are Windsor's standard Meta Ads field names but
// unverified end-to-end. First run: check the console output against what you
// see in Meta Events Manager for the same day, and adjust FIELD names below
// if they don't line up. Get your API key from Windsor.ai → Settings → API.
//
// Also note (from ad-relaunch-plan.md): as of 2026-09-19 all 8 ads in this
// account are PAUSED, so Meta events will legitimately be near-zero until ads
// relaunch. This check is most useful as a "did tracking silently break"
// signal once ads are live again — don't be alarmed by zeros while paused.

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
  if (!res.ok) throw new Error(`Windsor API returned ${res.status}: ${await res.text()}`);
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
  if (!res.ok) throw new Error(`Shopify API returned ${res.status}: ${await res.text()}`);
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

  console.log(`Cross-check for ${date}:`);
  console.log(`  Shopify orders: ${shopifyOrders}`);
  console.log(`  Meta Purchase events (via Windsor): ${meta.purchases}`);
  console.log(`  Meta AddToCart events (via Windsor): ${meta.addToCarts}`);

  if (shopifyOrders > 0 && meta.purchases === 0) {
    console.error(
      `MISMATCH: Shopify recorded ${shopifyOrders} order(s) on ${date} but Meta shows 0 Purchase events. ` +
        `This looks like a tracking break, not normal variance — worth checking Meta Events Manager. ` +
        `(If ads are currently paused, this may be expected — see ad-relaunch-plan.md.)`
    );
    process.exitCode = 1; // fails the CI step so it surfaces in the daily email
  } else {
    console.log('No mismatch detected.');
  }
}

main().catch((err) => {
  console.error('Cross-check script error:', err.message);
  process.exitCode = 1;
});
