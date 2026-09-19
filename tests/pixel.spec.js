// @ts-check
const { test, expect } = require('@playwright/test');
const { PRODUCT_PAGES } = require('./pages');

// Checks that the Meta Pixel actually fires the requests it's supposed to on
// the two events that matter most for ad optimisation: PageView/ViewContent on
// page load, and AddToCart on the add-to-cart click. This only proves the
// browser SENT the request — it doesn't prove Meta accepted/processed it (that
// requires Meta Events Manager, or the Windsor cross-check in
// scripts/meta-shopify-crosscheck.mjs). Still useful: most real-world pixel
// breakage is the tag not firing at all (a broken snippet, a blocked resource,
// a JS error before it runs), which this catches directly.

function isMetaPixelRequest(url) {
  return url.includes('facebook.com/tr') || url.includes('connect.facebook.net');
}

for (const p of PRODUCT_PAGES) {
  test(`${p.name} — Meta Pixel fires ViewContent on page load`, async ({ page }) => {
    const pixelRequests = [];
    page.on('request', (req) => {
      if (isMetaPixelRequest(req.url())) pixelRequests.push(req.url());
    });

    await page.goto(p.path, { waitUntil: 'load' });
    await page.waitForTimeout(2000); // pixel fires async after page scripts settle

    const fbTrCalls = pixelRequests.filter((u) => u.includes('facebook.com/tr'));
    expect(fbTrCalls.length, `${p.name}: no Meta Pixel network calls seen at all — pixel may not be installed/loading`).toBeGreaterThan(0);

    const viewContentCall = fbTrCalls.find((u) => /ViewContent|PageView/i.test(decodeURIComponent(u)));
    expect(viewContentCall, `${p.name}: Pixel loaded but no PageView/ViewContent event fired`).toBeTruthy();
  });

  test(`${p.name} — Meta Pixel fires AddToCart on add-to-cart click`, async ({ page }) => {
    const pixelRequests = [];
    page.on('request', (req) => {
      if (isMetaPixelRequest(req.url())) pixelRequests.push(req.url());
    });

    await page.goto(p.path, { waitUntil: 'load' });

    let addToCartButton = page.getByRole('button', { name: /add to cart/i }).first();
    if ((await addToCartButton.count()) === 0) {
      addToCartButton = page.locator('button[name="add"]').first();
    }
    await addToCartButton.click();
    await page.waitForTimeout(2000);

    const addToCartCall = pixelRequests.find((u) => /AddToCart/i.test(decodeURIComponent(u)));
    expect(addToCartCall, `${p.name}: clicked Add to cart but no Meta Pixel AddToCart event fired`).toBeTruthy();

    await page.request.post('/cart/clear.js').catch(() => {});
  });
}
