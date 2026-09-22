// Central list of pages under test. Update here when the catalogue changes.
module.exports.PRODUCT_PAGES = [
  {
    name: 'Jeans (Selvedge Denim)',
    path: '/products/rabiun-heavyweight-selvedge-denim-forest-green-yellow-overdye',
    expectPriceContains: '150', // £150.00 as of 2026-09-19 — update if price changes
  },
  {
    name: 'Hat (Green & Leopard)',
    path: '/products/rabiun-double-brim-painters-hat-green-and-leopard',
  },
  {
    name: 'Hat (Black & Zebra)',
    path: '/products/double-brim-painters-hat-black-and-zebra-print',
  },
];

module.exports.OTHER_PAGES = [
  { name: 'Homepage', path: '/' },
  { name: 'Checkout entry (cart)', path: '/cart' },
  { name: 'FAQ / Contact', path: '/pages/contact' },
];

// Known redirects worth checking daily. Add an entry every time a redirect bug
// gets found and fixed, so it's caught automatically if it regresses:
// { name: '...', from: '/products/old-slug', expectPathContains: '/products/new-slug' }
module.exports.REDIRECT_CHECKS = [];
