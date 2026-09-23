// Shopify Admin GraphQL access for CI, via a Dev Dashboard app and the
// client credentials grant: the app's client ID + secret are swapped for a
// token that lasts 24 hours. Needs SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID
// and SHOPIFY_CLIENT_SECRET.
//
// Customer security comes first (see CLAUDE.md): the app has read_orders
// only, and callers ask for counts, never customer fields. The fetched
// token is masked in the Actions log straight away, like a secret.
import fetch from 'node-fetch';

const API_VERSION = '2026-07';
const { SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET } = process.env;

export const shopifyConfigured = () => Boolean(SHOPIFY_STORE_DOMAIN && SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET);

let token;

async function getToken() {
  if (token) return token;
  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: SHOPIFY_CLIENT_ID, client_secret: SHOPIFY_CLIENT_SECRET }),
  });
  // Status only: the response body could echo credentials back.
  if (!res.ok) throw new Error(`Shopify token request returned ${res.status}`);
  token = (await res.json()).access_token;
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${token}`);
  return token;
}

export async function shopifyGraphql(query, variables = {}) {
  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken() },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify API returned ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`Shopify API error: ${body.errors[0].message}`);
  return body.data;
}
