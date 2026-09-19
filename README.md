# Rabiun QA — daily automated site check

A daily, unattended QA suite for rabiun.com: functional checks, Meta Pixel firing,
a Lighthouse performance trend, and a static pass/fail dashboard. Built to run on
GitHub Actions' free tier — no server, no paid service.

## What it checks, every day at ~07:00 London time

- **Page loads**: homepage, all 3 product pages, cart (checkout entry), FAQ — no
  4xx/5xx, no broken images, no failed network requests.
- **Price + copy**: each product page's price (read from Shopify's own
  `og:price:amount` meta tag, so it survives theme changes) and an "Add to cart"
  button that's visible, enabled, and actually adds the item to the cart.
- **SEO basics**: title, meta description, and (on product pages) structured
  data (JSON-LD) present.
- **Mobile layout**: a full-page screenshot of each product page at iPhone
  width, diffed against yesterday's — flags anything that visibly shifted.
- **Meta Pixel**: confirms the pixel actually fires PageView/ViewContent on
  load and AddToCart on the add-to-cart click (network-level check — proves
  the browser sent it, not that Meta processed it).
- **Meta/Shopify tracking cross-check** (optional, needs API keys — see
  below): compares yesterday's Shopify order count against yesterday's Meta
  Purchase events via Windsor. Flags it if Shopify shows sales but Meta shows
  zero — a real tracking break, not noise.
- **Lighthouse performance**: mobile Performance/SEO/Accessibility/Best
  Practices scores for all 4 pages, logged to a CSV every day so it's a
  trend, not a one-off screenshot of a good or bad moment.
- **Redirects**: an empty list to start (`tests/pages.js`) — add an entry
  every time you fix a redirect bug, so it's caught automatically if it comes
  back.

## What you need to do (one-time setup)

1. **Create a GitHub repo** and push this folder to it (private repo is
   fine, GitHub Actions' free minutes apply either way for a suite this
   small).
2. **Enable GitHub Pages**: repo Settings → Pages → Source → "GitHub
   Actions". The workflow publishes the dashboard there automatically.
3. **Approve the first scheduled run**: GitHub disables `schedule` triggers
   on a new repo until you've run the workflow manually once. Go to Actions →
   "Rabiun daily QA" → "Run workflow" to kick off the first run by hand.
4. **(Optional) Add the Meta/Shopify cross-check secrets** — repo Settings →
   Secrets and variables → Actions → New repository secret:
   - `WINDSOR_API_KEY` — from Windsor.ai → Settings → API (separate from the
     Windsor connection Claude uses; this is a plain REST API key).
   - `SHOPIFY_STORE_DOMAIN` — e.g. `rabiun.myshopify.com`.
   - `SHOPIFY_ADMIN_ACCESS_TOKEN` — an Admin API access token with
     `read_orders` scope (Shopify Admin → Settings → Apps → Develop apps).

   Without these three, everything else still runs fine — this one check is
   skipped rather than failing the whole suite.
5. **Failure emails**: GitHub already does this for you. Go to your GitHub
   account → Settings → Notifications, and make sure "Actions" → "Send
   notifications for failed workflows only" is on for the account that owns
   this repo. No extra service needed.

## Important caveat — please read before trusting this blindly

I could not run this suite against the live rabiun.com site from this
session — the cloud sandbox's network policy blocks direct access to
rabiun.com (the same blocker noted in `ad-relaunch-plan.md` for video
uploads). So what I've verified here is: the test files parse correctly, all
36 tests list as expected, and the dashboard/CSV-logging scripts produce
correct output against mock data. What I have **not** verified is that the
CSS/DOM selectors match the live site exactly, or that the Windsor API field
names in `scripts/meta-shopify-crosscheck.mjs` are exactly right (I don't
have a Windsor API key to test with).

I deliberately used resilient selectors to reduce this risk: role/text-based
locators for the Add to cart button (falls back to Shopify's standard
`button[name="add"]`), and Shopify's own `og:price:amount` meta tag for
price rather than a theme CSS class. But the honest answer is: **the first
real GitHub Actions run is the actual verification step.** Trigger it
manually after setup, check the Actions log and the dashboard, and tell me
what breaks — most likely candidates are the mobile screenshot baseline
(first run creates it, so it can't fail; second run is the real test) and
the Windsor field names if you add the cross-check secrets.

## Files

```
tests/
  pages.js              — the list of pages/products under test, edit here when the catalogue changes
  site-health.spec.js    — page loads, price/copy, add-to-cart, images, SEO, mobile screenshots
  pixel.spec.js           — Meta Pixel firing checks
scripts/
  lighthouse-log.mjs      — runs Lighthouse, appends to data/lighthouse-history.csv
  meta-shopify-crosscheck.mjs — optional Meta vs Shopify order cross-check
  build-dashboard.mjs     — builds dashboard/index.html from the run + Lighthouse history
.github/workflows/qa-daily.yml — the daily cron + GitHub Pages publish
```

## Running it yourself, locally

```
npm install
npx playwright install --with-deps chromium
npx playwright test              # functional + pixel tests
npm run lighthouse               # performance scores
npm run dashboard                # rebuilds dashboard/index.html
```
