# vitalykrauss.art

One-page site for Vitaly Krauss. Open `index.html` in a browser, or run a static server from this folder.

Prices, sizes, editions, exhibition lines, and Series II titles are placeholders.

The shop offers digital art prints only. Each work has independent size variants with price, edition, and availability in `js/content.js`. Size and price options are demonstration data pending confirmation. Requests identify each work and size separately and prepare an email to kraussvitaliy@gmail.com.

The private content studio lives in `admin/`; see [setup, content management and hosting instructions](admin/README.md). It runs as a separate Node.js service and is excluded from GitHub Pages publication. The public site reads the published catalogue from `https://studio.vitalykrauss.art/api/catalogue`; `js/content.js` is the initial fallback, not the live editing interface. Original uploads remain private; only reduced web copies are published.
