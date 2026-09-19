// @ts-check
const { test, expect } = require('@playwright/test');
const { PRODUCT_PAGES, OTHER_PAGES, REDIRECT_CHECKS } = require('./pages');
const { useUkMarket, addToCartButton } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await useUkMarket(page);
});

// ---- Page loads + broken images + SEO basics, for every page in the list ----
for (const p of [...PRODUCT_PAGES, ...OTHER_PAGES]) {
  test(`${p.name} — loads, no broken images, SEO basics present`, async ({ page }) => {
    const failedRequests = [];
    const brokenImages = [];
    page.on('requestfailed', (req) => failedRequests.push(req.url()));
    // Broken images = image requests the CDN answered with an error. This is
    // the definitive check; run #1 used <img>.naturalWidth === 0, which also
    // flags lazy-loaded images that simply haven't been scrolled into view yet.
    page.on('response', (res) => {
      if (res.request().resourceType() === 'image' && res.status() >= 400) {
        brokenImages.push(`${res.status()} ${res.url()}`);
      }
    });

    const response = await page.goto(p.path, { waitUntil: 'load' });
    expect(response, `${p.name} should return a response`).toBeTruthy();
    expect(
      response.status(),
      `${p.name} (${p.path}) returned HTTP ${response.status()}`
    ).toBeLessThan(400);

    // Give lazy images a chance to request by scrolling the page once.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 100));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle').catch(() => {});

    expect(brokenImages, `Broken images on ${p.name}: ${brokenImages.join(', ')}`).toEqual([]);

    // SEO basics
    const title = await page.title();
    expect(title.trim().length, `${p.name} has an empty <title>`).toBeGreaterThan(0);

    // Shopify's /cart page has no meta description by design — don't alert on it.
    if (!p.path.startsWith('/cart')) {
      const metaDescription = await page
        .locator('meta[name="description"]')
        .getAttribute('content')
        .catch(() => null);
      expect(
        metaDescription && metaDescription.trim().length > 0,
        `${p.name} is missing a meta description`
      ).toBeTruthy();
    }

    if (PRODUCT_PAGES.includes(p)) {
      const ldJsonCount = await page.locator('script[type="application/ld+json"]').count();
      expect(ldJsonCount, `${p.name} has no structured data (JSON-LD) script tag`).toBeGreaterThan(0);
    }

    expect(failedRequests, `${p.name} had failed network requests: ${failedRequests.join(', ')}`).toEqual([]);
  });
}

// ---- Product page specifics: price + key copy present, add-to-cart works ----
for (const p of PRODUCT_PAGES) {
  test(`${p.name} — price and add-to-cart present and working`, async ({ page }) => {
    await page.goto(p.path, { waitUntil: 'load' });

    // Price: Shopify's standard og:price meta tags, not a theme CSS class.
    const ogPrice = await page.locator('meta[property="og:price:amount"]').getAttribute('content').catch(() => null);
    const ogCurrency = await page.locator('meta[property="og:price:currency"]').getAttribute('content').catch(() => null);
    expect(ogPrice, `${p.name} is missing the og:price:amount meta tag entirely`).toBeTruthy();
    expect(ogCurrency, `${p.name}: expected GBP pricing but page served ${ogCurrency} — UK market cookie not applied?`).toBe('GBP');
    expect(parseFloat(ogPrice || '0'), `${p.name} price looks wrong: "${ogPrice}"`).toBeGreaterThan(0);
    if (p.expectPriceContains) {
      expect(ogPrice, `${p.name} price changed — expected it to contain "${p.expectPriceContains}"`).toContain(
        p.expectPriceContains
      );
    }

    const button = await addToCartButton(page).resolve();
    await expect(button, `${p.name} has no visible "Add to cart" button`).toBeVisible();
    await expect(button, `${p.name} add-to-cart button is disabled (out of stock / bug)`).toBeEnabled();
    await button.scrollIntoViewIfNeeded();
    await button.click();

    // Confirm the cart actually registered the item via Shopify's cart.js —
    // the most theme-independent signal there is.
    await page.waitForTimeout(1500);
    const cartResponse = await page.request.get('/cart.js');
    const cartJson = await cartResponse.json().catch(() => ({ item_count: 0 }));
    expect(
      cartJson.item_count,
      `${p.name}: cart did not register an item after clicking Add to cart (cart.js item_count=${cartJson.item_count})`
    ).toBeGreaterThan(0);

    await page.request.post('/cart/clear.js').catch(() => {});
  });
}

// ---- Redirects ----
for (const r of REDIRECT_CHECKS) {
  test(`Redirect — ${r.name}`, async ({ page }) => {
    const response = await page.goto(r.from, { waitUntil: 'load' });
    expect(response.status(), `${r.name}: unexpected status`).toBeLessThan(400);
    expect(page.url(), `${r.name}: did not land on the expected page`).toContain(r.expectPathContains);
  });
}

// ---- Mobile layout: screenshot for visual-diff tracking (mobile project only) ----
for (const p of PRODUCT_PAGES) {
  test(`${p.name} — mobile layout screenshot`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Screenshot only needed once, on the mobile project');
    await page.goto(p.path, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await testInfo.attach('mobile-screenshot', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await expect(page).toHaveScreenshot(`${p.path.replace(/\//g, '_')}-mobile.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  });
}
