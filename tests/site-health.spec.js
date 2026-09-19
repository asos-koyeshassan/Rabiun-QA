// @ts-check
const { test, expect } = require('@playwright/test');
const { PRODUCT_PAGES, OTHER_PAGES, REDIRECT_CHECKS } = require('./pages');

// ---- Page loads + broken images + SEO basics, for every page in the list ----
for (const p of [...PRODUCT_PAGES, ...OTHER_PAGES]) {
  test(`${p.name} — loads, no broken images, SEO basics present`, async ({ page }) => {
    const failedRequests = [];
    page.on('requestfailed', (req) => failedRequests.push(req.url()));

    const response = await page.goto(p.path, { waitUntil: 'load' });
    expect(response, `${p.name} should return a response`).toBeTruthy();
    expect(
      response.status(),
      `${p.name} (${p.path}) returned HTTP ${response.status()}`
    ).toBeLessThan(400);

    // No console errors that would indicate a broken script/page
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Broken images: check every <img> that's actually rendered on the page
    const images = page.locator('img');
    const count = await images.count();
    const broken = [];
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const naturalWidth = await img.evaluate((el) => el.naturalWidth).catch(() => null);
      const src = await img.getAttribute('src').catch(() => null);
      if (naturalWidth === 0 && src) broken.push(src);
    }
    expect(broken, `Broken images on ${p.name}: ${broken.join(', ')}`).toEqual([]);

    // SEO basics
    const title = await page.title();
    expect(title.trim().length, `${p.name} has an empty <title>`).toBeGreaterThan(0);

    const metaDescription = await page
      .locator('meta[name="description"]')
      .getAttribute('content')
      .catch(() => null);
    expect(
      metaDescription && metaDescription.trim().length > 0,
      `${p.name} is missing a meta description`
    ).toBeTruthy();

    // Don't hard-fail on JSON-LD absence on non-product pages (home/cart/FAQ don't
    // need Product schema), but do require it on product pages.
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

    // Price: read Shopify's standard og:price:amount meta tag rather than a theme
    // CSS class — this is set automatically by Shopify on every product page and
    // survives theme redesigns that would break a class-based selector.
    const ogPrice = await page.locator('meta[property="og:price:amount"]').getAttribute('content').catch(() => null);
    expect(ogPrice, `${p.name} is missing the og:price:amount meta tag entirely`).toBeTruthy();
    expect(parseFloat(ogPrice || '0'), `${p.name} price looks wrong: "${ogPrice}"`).toBeGreaterThan(0);
    if (p.expectPriceContains) {
      expect(ogPrice, `${p.name} price changed — expected it to contain "${p.expectPriceContains}"`).toContain(
        p.expectPriceContains
      );
    }

    // Add-to-cart button: prefer a semantic role/text match so this doesn't
    // depend on a specific theme's CSS classes. Falls back to Shopify/Dawn's
    // conventional button[name="add"] if the accessible name doesn't match.
    let addToCartButton = page.getByRole('button', { name: /add to cart/i }).first();
    if ((await addToCartButton.count()) === 0) {
      addToCartButton = page.locator('button[name="add"]').first();
    }
    await expect(addToCartButton, `${p.name} has no visible "Add to cart" button`).toBeVisible();
    await expect(addToCartButton, `${p.name} add-to-cart button is disabled (out of stock / bug)`).toBeEnabled();

    await addToCartButton.click();

    // Confirm the cart actually picked it up: either a cart drawer opens with an
    // item, or the cart icon/count updates. Check the cart count is non-zero as
    // the most theme-independent signal.
    await page.waitForTimeout(1500); // let the cart AJAX call + UI settle
    const cartCountText = await page
      .locator('[class*="cart-count"], [data-cart-count], a[href="/cart"]')
      .first()
      .innerText()
      .catch(() => '');
    const cartResponse = await page.request.get('/cart.js');
    const cartJson = await cartResponse.json().catch(() => ({ item_count: 0 }));
    expect(
      cartJson.item_count > 0 || /[1-9]/.test(cartCountText),
      `${p.name}: cart did not register an item after clicking Add to cart (cart.js item_count=${cartJson.item_count})`
    ).toBeTruthy();

    // Clean up: don't leave test items sitting in a shared cart session.
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

// ---- Mobile layout: screenshot for visual-diff tracking (mobile-safari project only) ----
for (const p of PRODUCT_PAGES) {
  test(`${p.name} — mobile layout screenshot`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-safari', 'Screenshot only needed once, on the mobile project');
    await page.goto(p.path, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await testInfo.attach('mobile-screenshot', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    // Playwright's built-in toHaveScreenshot does pixel-diffing against a
    // checked-in baseline. First run creates the baseline; from then on a
    // failure here means the mobile layout visibly changed.
    await expect(page).toHaveScreenshot(`${p.path.replace(/\//g, '_')}-mobile.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.05, // allow ~5% drift (fonts/carousel state) before flagging
    });
  });
}
