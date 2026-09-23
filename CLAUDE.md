# Rabiun-QA

Automated QA suite for rabiun.com (Shopify). Playwright + GitHub Actions, 
checking site health, SEO basics, pricing, add-to-cart, mobile layout, 
and Meta pixel integrity.

## Commands
- Run tests locally: `npx playwright test`
- Run a single file: `npx playwright test tests/site-health.spec.js`
- View HTML report: `npx playwright show-report`

## Known gotchas — don't relearn these
- GitHub runners are US-based, so Shopify Markets serves USD unless
  cookies `localization=GB` + `cart_currency=GBP` are set directly.
- Mobile project must force `browserName: 'chromium'` — the iPhone
  device preset defaults to WebKit, which the workflow doesn't install.
- The Meta pixel is a Shopify custom pixel in a sandboxed iframe; 
  `fbq()` hooks see nothing — capture at the network level via 
  `page.route` instead.
- `networkidle` never fires on Shopify pages (constant pixel chatter);
  use `domcontentloaded`.
- `.github/workflows/qa-daily.yml` cannot be edited by an AI coding
  tool's file writes — GitHub blocks workflow-file changes from 
  anything but a direct, human-authenticated commit. Edit it by hand
  on GitHub's website.

## Dashboard
- Data and looks are split. `scripts/dashboard/data.mjs` records each run
  into `data/*.csv` and works out every number (streaks, pass rates,
  per-check flakiness, Lighthouse trends), which is also published as
  `dashboard/data.json`. Themes in `scripts/dashboard/themes/` only draw that
  object; `DASHBOARD_THEME` picks one (default `basic`).
- New metric → add it in `data.mjs`. New look → add a theme file. Bump
  `SCHEMA_VERSION` if a field is renamed or removed.
- `data/check-history.csv` keeps one row per check per run. It's the raw
  material for per-check stats and can't be backfilled, so don't drop it.
- Planned: a game-style theme matching rabiun.com, once there's enough
  history to make it worth showing off.

## Public repo — privacy rules
This repo, its Actions logs and the GitHub Pages dashboard are all public.
- Never write customer data, order/sales figures, ad spend or ad account
  details to `data/`, the dashboard, test output or `console.log`.
  Scripts that read private APIs log only pass/fail or match/mismatch.
- Don't reference private business docs (ad plans, release logs, strategy
  notes) in code comments or the README.
- Secrets live in GitHub Actions secrets only — never in files.

## Workflow
- Branch → PR → suite runs on the PR → merge on green.
- `main` is protected by the "protect main" ruleset: changes land only via
  PR, and the `qa` check must pass. Nothing (including the bot) can push
  to it directly.
- History CSVs live on the `qa-data` branch, not `main`. Each run restores
  them into `data/` (git-ignored on `main`), appends today's results, and the
  bot commits them back to `qa-data`. PR runs only test: they skip saving
  history and publishing the dashboard.
- Refer to PRs as number + short name + link, e.g. "#2 (privacy clean-up)".