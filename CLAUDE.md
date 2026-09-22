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
- Daily CSV history commits land straight on `main` via the bot.