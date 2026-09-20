// @ts-check
const { test, expect } = require('@playwright/test');
const { PRODUCT_PAGES } = require('./pages');
const { useUkMarket, addToCartButton, installPixelHook, pixelEvents, isMetaPixelRequest } = require('./helpers');

// Checks that the Meta Pixel actually fires on the two events that matter for
// ad optimisation: PageView/ViewContent on load, AddToCart on the click. This
// proves the browser fired the event, not that Meta processed it (that's the
// Windsor cross-check in scripts/meta-shopify-crosscheck.mjs). Still worth
// having: most real pixel breakage is the tag not firing at all.
//
// How: fbq() is hooked in every frame (see helpers.installPixelHook) because
// the pixel runs inside Shopify's custom-pixel sandbox iframe. Network calls to
// facebook.com/tr are counted too, as a secondary "did anything go out" signal.

test.beforeEach(async ({ page }) => {
  await useUkMarket(page);
  await installPixelHook(page);
});

function countPixelRequests(page) {
  const counter = { n: 0 };
  page.on('request', (req) => {
    if (isMetaPixelRequest(req.url())) counter.n++;
  });
  return counter;
}

for (const p of PRODUCT_PAGES) {
  test(`${p.name} — Meta Pixel fires PageView/ViewContent on page load`, async ({ page }) => {
    const requests = countPixelRequests(page);
    await page.goto(p.path, { waitUntil: 'load' });
    await page.waitForTimeout(4000);

    const events = await pixelEvents(page);
    expect(
      requests.n + events.length,
      `${p.name}: no Meta Pixel activity at all — pixel not installed or not loading`
    ).toBeGreaterThan(0);
    expect(
      events.some((e) => /^(PageView|ViewContent)$/i.test(e)),
      `${p.name}: pixel loaded but no PageView/ViewContent fired. fbq events seen: [${events.join(', ')}], network calls: ${requests.n}`
    ).toBeTruthy();
  });

  test(`${p.name} — Meta Pixel fires AddToCart on add-to-cart click`, async ({ page }) => {
    const requests = countPixelRequests(page);
    await page.goto(p.path, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const button = await addToCartButton(page).resolve();
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.waitForTimeout(4000);

    const events = await pixelEvents(page);
    expect(
      events.some((e) => /^AddToCart$/i.test(e)),
      `${p.name}: clicked Add to cart but no AddToCart pixel event fired. fbq events seen: [${events.join(', ')}], network calls: ${requests.n}`
    ).toBeTruthy();

    await page.request.post('/cart/clear.js').catch(() => {});
  });
}
