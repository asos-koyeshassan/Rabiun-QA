// Shared helpers for the test specs.

// Pin the storefront to the UK market before loading a page. Shopify Markets
// picks currency/pricing from the visitor's IP, and GitHub's runners are in the
// US — run #1 saw the jeans at 205.00 (USD) instead of £150. We want to test
// what a UK customer sees, so set Shopify's localization cookie first.
async function useUkMarket(page) {
  await page.request
    .post('/localization', { form: { country_code: 'GB', return_to: '/' }, maxRedirects: 0 })
    .catch(() => {});
}

// The main add-to-cart button. Themes often render a second, sticky copy that
// sits off-screen until you scroll, and `.first()` can land on that one and
// then fail with "element is outside of the viewport" (exactly what happened
// in run #1). Exclude anything sticky, then fall back to Shopify's
// conventional button[name="add"].
function addToCartButton(page) {
  const nonSticky = page
    .locator('button:not([class*="sticky"])')
    .filter({ hasText: /add to cart/i })
    .first();
  return {
    async resolve() {
      if ((await nonSticky.count()) > 0) return nonSticky;
      return page.locator('button[name="add"]').first();
    },
  };
}

// Meta Pixel sends events either as a GET with ?ev=PageView in the URL or as a
// POST with the event name in the form body — run #1 only checked the URL and
// missed every event. Look in both.
function pixelEventName(request) {
  const haystack = `${request.url()} ${request.postData() || ''}`;
  const m = decodeURIComponent(haystack).match(/\bev=([A-Za-z]+)/);
  return m ? m[1] : null;
}

function isMetaPixelRequest(url) {
  return url.includes('facebook.com/tr') || url.includes('connect.facebook.net');
}

module.exports = { useUkMarket, addToCartButton, pixelEventName, isMetaPixelRequest };
