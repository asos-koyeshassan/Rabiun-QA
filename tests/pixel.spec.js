// @ts-check
const { test, expect } = require('@playwright/test');
const { PRODUCT_PAGES } = require('./pages');
const { useUkMarket, addToCartButton, pixelEventName, isMetaPixelRequest } = require('./helpers');

// Checks that the Meta Pixel actually fires on the two events that matter for
// ad optimisation: PageView/ViewContent on load, AddToCart on the click. This
// proves the browser SENT the event, not that Meta processed it (that's the
// Windsor cross-check in scripts/meta-shopify-crosscheck.mjs). Still worth
// having: most real pixel breakage is the tag not firing at all.

test.beforeEach(async ({ page }) => {
  await useUkMarket(page);
});

function collectPixelEvents(page) {
  const events = [];
  page.on('request', (req) => {
    if (!isMetaPixelRequest(req.url())) return;
    const ev = pixelEventName(req);
    if (ev) events.push(ev);
    else events.push('(pixel request, no ev name)');
  });
  return events;
}

for (const p of PRODUCT_PAGES) {
  test(`${p.name} — Meta Pixel fires PageView/ViewContent on page load`, async ({ page }) => {
    const events = collectPixelEvents(page);
    await page.goto(p.path, { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    expect(events.length, `${p.name}: no Meta Pixel network calls at all — pixel not installed or not loading`).toBeGreaterThan(0);
    expect(
      events.some((e) => /^(PageView|ViewContent)$/i.test(e)),
      `${p.name}: pixel loaded but no PageView/ViewContent fired. Events seen: ${events.join(', ')}`
    ).toBeTruthy();
  });

  test(`${p.name} — Meta Pixel fires AddToCart on add-to-cart click`, async ({ page }) => {
    const events = collectPixelEvents(page);
    await page.goto(p.path, { waitUntil: 'load' });

    const button = await addToCartButton(page).resolve();
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.waitForTimeout(3000);

    expect(
      events.some((e) => /^AddToCart$/i.test(e)),
      `${p.name}: clicked Add to cart but no AddToCart pixel event fired. Events seen: ${events.join(', ')}`
    ).toBeTruthy();

    await page.request.post('/cart/clear.js').catch(() => {});
  });
}
