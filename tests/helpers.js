// Shared helpers for the test specs.

// Pin the storefront to the UK market. Shopify Markets picks currency from the
// visitor's IP and GitHub's runners are in the US — runs #1 and #2 saw the jeans
// at 205.00 USD instead of £150. Shopify stores the choice in two plain cookies
// (checked on the live site: localization=GB, cart_currency=GBP), so set those
// directly. Run #2 tried POSTing to /localization instead and it didn't take.
async function useUkMarket(page) {
  const host = new URL(process.env.SITE_BASE_URL || 'https://rabiun.com').hostname;
  await page.context().addCookies([
    { name: 'localization', value: 'GB', domain: host, path: '/' },
    { name: 'cart_currency', value: 'GBP', domain: host, path: '/' },
  ]);
}

// The main add-to-cart button. Themes often render a second, sticky copy that
// sits off-screen until you scroll, and `.first()` can land on that one and
// then fail with "element is outside of the viewport" (run #1). Exclude
// anything sticky, then fall back to Shopify's conventional button[name="add"].
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

// --- Meta Pixel event capture ---
// On rabiun.com the Meta Pixel is loaded by a Shopify *custom pixel*, which
// runs inside a sandboxed same-origin iframe (/web-pixels@.../sandbox/...).
// Its network calls go out as beacons whose body Playwright can't read, so
// run #2 saw facebook.com/tr requests but no event names. Instead, hook fbq()
// itself in every frame before any page script runs, and record the event
// name of each track call. A Proxy keeps fbq's own properties (queue,
// callMethod, loaded...) intact so the real pixel keeps working normally.
async function installPixelHook(page) {
  await page.addInitScript(() => {
    window.__fbEvents = [];
    let real;
    Object.defineProperty(window, 'fbq', {
      configurable: true,
      enumerable: true,
      get() {
        return real;
      },
      set(fn) {
        if (typeof fn !== 'function') {
          real = fn;
          return;
        }
        real = new Proxy(fn, {
          apply(target, thisArg, args) {
            const cmd = args[0];
            if (cmd === 'track' || cmd === 'trackCustom') window.__fbEvents.push(String(args[1]));
            if (cmd === 'trackSingle' || cmd === 'trackSingleCustom') window.__fbEvents.push(String(args[2]));
            return Reflect.apply(target, thisArg, args);
          },
        });
      },
    });
  });
}

// Collect recorded pixel events from every frame (the custom pixel lives in an
// iframe, so the main frame alone would come back empty).
async function pixelEvents(page) {
  const all = [];
  for (const frame of page.frames()) {
    const events = await frame.evaluate(() => window.__fbEvents || []).catch(() => []);
    all.push(...events);
  }
  return all;
}

function isMetaPixelRequest(url) {
  return url.includes('facebook.com/tr') || url.includes('connect.facebook.net');
}

module.exports = { useUkMarket, addToCartButton, installPixelHook, pixelEvents, isMetaPixelRequest };
