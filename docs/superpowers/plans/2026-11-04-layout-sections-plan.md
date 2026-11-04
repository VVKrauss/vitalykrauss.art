# Layout Sections, Independent Hero, Works+Series, Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner toggle and reorder the five public sections (Works, Exhibitions, About, Contact, Shop) from the Studio, give the hero its own independent short text, fold Series into Works (series become one grid card each, opening a dedicated `series.html` page like exhibitions already do), and add a standalone Contact block (email + ordered social/custom links with an auto-detected icon).

**Architecture:** Server-side data model (`admin/src/catalogue-model.mjs`) gains four new catalogue fields — `hero`, `contact`, `layout`, `worksOrder` — validated and migrated the same way existing fields are. The Studio client (`admin/public/content.js`) gets two new tabs (Layout, Contact) built from the same `state.draft[tab]` / Sortable.js / toast patterns already used for Series and Exhibition media ordering. The public site (`js/content.js`, `js/main.js`, `index.html`) becomes layout-driven: nav links, section DOM order/visibility, the hero markup, and a new Works grid (series cards + standalone work cards) all read from the published catalogue instead of being hardcoded. A new `series.html` + `js/series.js` pair mirrors the existing `exhibition.html` + `js/exhibition.js` static-page pattern.

**Tech Stack:** Node.js 22 + Express + SQLite (Studio backend, unchanged), vanilla JS/HTML/CSS (public site and Studio client, unchanged), SortableJS (already a Studio dependency), `node --test` for both `tests/` and `admin/test/`.

**Spec:** [docs/superpowers/specs/2026-11-04-layout-sections-design.md](../specs/2026-11-04-layout-sections-design.md)

## Global Constraints

- No frameworks/bundlers added to the public site; Studio build stays `esbuild` via `npm run build` for `auth-client.js` only — `content.js`/`app.js` stay hand-written, unbundled.
- New catalogue fields validate with the same strictness as existing ones in `catalogue-model.mjs` (length limits, `identifier()`/`translated()`/`string()` reuse), and old stored drafts without the new fields must load without error (migrate to defaults, same pattern as `about`/`exhibitions[].country` in `admin/src/catalogue.mjs:state()`).
- `layout` section ids are exactly `works`, `exhibitions`, `about`, `contact`, `shop` (5 entries, each exactly once). Default order/visibility when missing: all five, enabled, in that order.
- Hero is never part of `layout` — always rendered, not toggleable, not reorderable.
- Contact's icon is computed server-side from the link URL at normalize time (ignore any client-sent `icon`), so the public site only ever reads a stored key and never re-implements the domain table.
- Section toggle control in the Studio UI must be an actual switch (`role="switch"`, `aria-checked`), not a checkbox styled to look like one.
- Existing tests (`tests/public-copy.test.mjs`, `admin/test/*.test.mjs`) must keep passing; new behavior gets new tests in the same files/patterns.
- Visual density/contrast changes on the public site follow the `better-ui`/`better-layout`/`better-typography`/`better-colors` skills in `.claude/skills/` — keep current fonts (Fraunces/Outfit) and palette, soften scale/contrast only where those skills flag it.

## Review Focus

- A published catalogue saved before this change (no `hero`/`contact`/`layout`/`worksOrder` keys) must render identically-ordered, fully-visible sections and an empty Contact block instead of crashing `normalizeCatalogue` or the public renderer.
- `worksOrder` entries referencing a work that got moved into a series (or a series that got archived) after the order was saved must not crash the public Works grid — stale entries drop, new ones append, exactly like `series[].workIds` already reconciles in `catalogue-model.mjs:97-102`.
- Disabling a section in Studio must remove its nav link and make every cross-link that currently hardcodes `#shop`/`#series`/`#about`/`#exhibitions` (e.g. the Shop "review-request" link in `js/main.js:357`, the exhibition-page back link `index.html#exhibitions` in `js/exhibition.js:14,19`) resolve to something that doesn't dead-end when that section is off.
- A Contact link whose URL is on an unrecognized domain must still save and render — with the generic `link` icon, not a validation failure.
- The Works grid must render correctly with zero series (all standalone), zero standalone works (all series), and zero works total (existing empty-state message), not just the mixed case.

---

## Task 1: Catalogue model — hero, contact, layout, worksOrder

**Files:**
- Modify: `admin/src/catalogue-model.mjs`
- Modify: `admin/src/about.mjs` (drop `email` from `defaultAbout()`)
- Create: `admin/src/social-icons.mjs`
- Modify: `admin/src/catalogue.mjs` (`empty()`, `state()` migration defaults)
- Test: `admin/test/content.test.mjs`

**Interfaces:**
- Produces: `normalizeCatalogue(input, mediaRecords, {draft}) -> {..., hero, contact, layout, worksOrder}` where
  - `hero = { intro: {en,ru,es} }`
  - `contact = { email: string, links: [{id, label:{en,ru,es}, url, icon}] }` (icon is server-computed, never trusts input)
  - `layout = [{id, enabled}]`, exactly the 5 known ids once each, in submitted order
  - `worksOrder = [{type:'series'|'work', id}]`, reconciled against current series/standalone-work ids (stale entries dropped, missing current ones appended, same approach as `series[].workIds`)
- Produces: `publicCatalogue(draft, mediaRecords, baseURL, publishedAt) -> {..., hero, contact, layout, worksOrder}` (same shapes, filtered the way `series`/`exhibitions` already filter archived/missing refs)
- Produces (new file): `socialIcon(url: string) -> string` — returns one of `'instagram'|'facebook'|'x'|'linkedin'|'youtube'|'behance'|'pinterest'|'tiktok'|'telegram'|'whatsapp'|'vk'|'threads'|'link'`, matched by hostname (e.g. `instagram.com`/`www.instagram.com` → `'instagram'`, `x.com`/`twitter.com` → `'x'`, `wa.me`/`whatsapp.com` → `'whatsapp'`, `t.me`/`telegram.org` → `'telegram'`, `vk.com` → `'vk'`, anything else → `'link'`).
- Consumes (Task 1 only): existing `translated()`, `string()`, `identifier()`, `array()`, `unique()`, `exhibitionURL()`-style validation helpers already in `catalogue-model.mjs`.

- [ ] **Step 1: Write failing tests for `socialIcon()`**

```js
// admin/test/content.test.mjs (new test, alongside existing ones; import { socialIcon } from '../src/social-icons.mjs')
test('socialIcon matches known social domains and falls back to link', () => {
  assert.equal(socialIcon('https://www.instagram.com/vitaly'), 'instagram');
  assert.equal(socialIcon('https://wa.me/123456'), 'whatsapp');
  assert.equal(socialIcon('https://example.test/portfolio'), 'link');
});
```

- [ ] **Step 2: Run test, verify it fails** — `node --test admin/test/content.test.mjs` → FAIL (`social-icons.mjs` not found)

- [ ] **Step 3: Implement `admin/src/social-icons.mjs`** exporting `socialIcon(url)`. Parse with `new URL(url)`, lower-case hostname, strip a leading `www.`, match against a small `Map`/object of known hostnames per platform listed above; any `URL` parse failure or unmatched host returns `'link'`.

- [ ] **Step 4: Run test, verify it passes**

- [ ] **Step 5: Write failing tests for `normalizeCatalogue` migration + validation of the 4 new fields**

```js
// admin/test/content.test.mjs
test('normalizeCatalogue fills hero/contact/layout/worksOrder defaults when absent', () => {
  const result = normalizeCatalogue({ heroWorkId: null, works: [], series: [], exhibitions: [] }, []);
  assert.deepEqual(result.hero, { intro: { en: '', ru: '', es: '' } });
  assert.deepEqual(result.contact, { email: '', links: [] });
  assert.deepEqual(result.layout, [
    { id: 'works', enabled: true }, { id: 'exhibitions', enabled: true }, { id: 'about', enabled: true },
    { id: 'contact', enabled: true }, { id: 'shop', enabled: true },
  ]);
  assert.deepEqual(result.worksOrder, []);
});

test('normalizeCatalogue rejects a layout missing a required section id', () => {
  assert.throws(() => normalizeCatalogue({ heroWorkId: null, works: [], series: [], exhibitions: [],
    layout: [{ id: 'works', enabled: true }] }, []), /раздел/i);
});

test('normalizeCatalogue computes contact link icon from the URL regardless of submitted icon', () => {
  const result = normalizeCatalogue({ heroWorkId: null, works: [], series: [], exhibitions: [],
    contact: { email: '', links: [{ id: 'l1', label: { en: 'Instagram' }, url: 'https://instagram.com/vitaly', icon: 'whatsapp' }] } }, []);
  assert.equal(result.contact.links[0].icon, 'instagram');
});

test('worksOrder reconciles stale and missing entries like series.workIds', () => {
  // build input with one series, one standalone work, and a worksOrder that's missing the standalone
  // work and references a work id that no longer exists; assert the result drops the stale id and
  // appends the current standalone work id.
});
```

- [ ] **Step 6: Run tests, verify they fail**

- [ ] **Step 7: Implement in `admin/src/catalogue-model.mjs`**
  - `translated()`-based `hero` validation: `const heroSource = input.hero ?? { intro: {} }; const hero = { intro: translated(heroSource.intro) };`
  - `contact` validation: email via the same regex currently used for `about.email` (move that check here); `links = array(contactSource.links ?? [], 50).map(link => ({ id: identifier(link.id), label: translated(link.label, true), url: /* reuse-or-extract the exhibitionURL-style https/http validator, generalized as e.g. `externalURL(value, limit)` */, icon: socialIcon(url) }))`, `unique(links)`.
  - `layout`: default array (5 ids above, `enabled: true`) when `input.layout` is nullish; otherwise require `array(input.layout, 5)` with exactly the 5 known ids, each once (`unique`, then compare id `Set` to the known `Set`), each `enabled` a boolean.
  - `worksOrder`: valid entries are `{type: 'series'|'work', id}` where a `'series'` id must be in the computed `series` ids and a `'work'` id must be in `works` with `seriesId === null`; reconcile with the same filter-then-append pattern as `series[].workIds` (lines ~97-102).
  - Remove `email` from `about` validation (now lives only on `contact`); update `about.mjs:defaultAbout()` to drop `email`.
  - Mirror all four fields into `publicCatalogue()`, filtering `worksOrder`/`contact.links` against ids that still exist, the same way `exhibitions[].workIds` is filtered against `ids` today.

- [ ] **Step 8: Update `admin/src/catalogue.mjs`** — add `hero`, `contact`, `layout`, `worksOrder` to `empty()`'s initial shape (so a brand-new install has them) and, in `state()`, spread the same defaults ahead of `JSON.parse(record.draft_json)` the way `about: defaultAbout()` already is, so a pre-existing stored draft migrates on read.

- [ ] **Step 9: Run tests, verify they pass** — `node --test admin/test/content.test.mjs`

- [ ] **Step 10: Run full admin test suite and `npm run check`** — `cd admin && npm test && npm run check`

- [ ] **Step 11: Commit**

```bash
git add admin/src/catalogue-model.mjs admin/src/about.mjs admin/src/social-icons.mjs admin/src/catalogue.mjs admin/test/content.test.mjs
git commit -m "feat(admin): add hero, contact, layout and worksOrder to the catalogue model"
```

---

## Task 2: Studio UI — Layout tab (hero text + section order/toggles)

**Files:**
- Modify: `admin/public/content.js`
- Modify: `admin/public/content.css`
- Test: `admin/test/ui-render.test.mjs`

**Interfaces:**
- Consumes: `state.draft.hero`, `state.draft.layout` (Task 1 shapes), existing `tab` variable / tab-switch wiring, existing `bindOrdering()`/`window.Sortable` usage pattern (`content.js:236`), existing `notify()`/toast flow for save errors.
- Produces: a `tab === 'layout'` render branch and a `bindLayout()` binder function, following the same naming convention as the existing `bindAbout()`/`bindOrdering()`/`bindInbox()` called from the main render function (`content.js:91`).

- [ ] **Step 1: Write failing render test**

```js
// admin/test/ui-render.test.mjs
test('layout tab renders hero fields and a toggle switch per section', () => {
  const html = render('layout');
  assert.match(html, /data-hero-intro="en"/);
  assert.match(html, /data-layout-id="works"[^>]*role="switch"/);
  assert.match(html, /data-layout-id="shop"/);
});
```

(Extend the `render()` helper's seed `state` in the test file's VM bootstrap to include `hero: {intro:{en:'',ru:'',es:''}}, layout: [{id:'works',enabled:true},{id:'exhibitions',enabled:true},{id:'about',enabled:true},{id:'contact',enabled:true},{id:'shop',enabled:true}]`.)

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Add a "Layout" entry to the tab navigation** in `content.js` alongside the existing works/exhibitions/series/shop(?)/about/requests tabs, and add a `tab === 'layout'` branch that renders: hero intro textareas for `en`/`ru`/`es` (reuse whatever markup helper the About tab already uses for translated text fields), then an ordered list of the 5 `state.draft.layout` entries, each item showing its display label (Works/Exhibitions/About/Contact/Shop) plus a `<button type="button" role="switch" aria-checked="..." data-layout-id="...">` toggle and a drag handle.

- [ ] **Step 4: Wire `bindLayout()`** — toggle button click flips that entry's `enabled` and calls the existing save path (same `dirty`/autosave-or-explicit-save pattern the other tabs use); initialize a `Sortable` instance on the layout list (same options as `content.js:236`) whose `onEnd` reorders `state.draft.layout` to match the new DOM order and saves, mirroring `saveOrder`.

- [ ] **Step 5: Add toggle-switch CSS** to `admin/public/content.css` — a small pill/thumb switch (`role="switch"` styling, `[aria-checked="true"]` state), matching the Studio's existing control styling (buttons/toasts), not the public site's CSS.

- [ ] **Step 6: Run test, verify it passes** — `node --test admin/test/ui-render.test.mjs`

- [ ] **Step 7: Run `npm run check`** — `cd admin && npm run check`

- [ ] **Step 8: Commit**

```bash
git add admin/public/content.js admin/public/content.css admin/test/ui-render.test.mjs
git commit -m "feat(admin): add Layout tab for hero text and section order/visibility"
```

---

## Task 3: Studio UI — Contact tab (email + ordered links)

**Files:**
- Modify: `admin/public/content.js`
- Test: `admin/test/ui-render.test.mjs`

**Interfaces:**
- Consumes: `state.draft.contact` (Task 1 shape), existing About-tab email field removal (email moves off the About tab render in this task), existing modal/list-add pattern used for exhibition media (add/remove/reorder an array of small records).
- Produces: a `tab === 'contact'` render branch and `bindContact()` binder, same calling convention as Task 2.

- [ ] **Step 1: Write failing render test**

```js
test('contact tab renders email field and an ordered link list', () => {
  const html = render('contact');
  assert.match(html, /data-contact-email/);
  assert.match(html, /data-action="add-contact-link"/);
});

test('about tab no longer renders an email field', () => {
  const html = render('about');
  assert.doesNotMatch(html, /data-about-email|data-author-email/);
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Remove the email field from the About tab render** in `content.js` (the field moves to Contact; the underlying model no longer has `about.email` per Task 1).

- [ ] **Step 4: Add the Contact tab render** — an email `<input type="email" data-contact-email>` plus a sortable list of links, each with a label (per-language text input(s), reusing the translated-field helper) and a URL input, a remove button, and an "Add link" button (`data-action="add-contact-link"`) that appends a new `{id: randomUUID-ish, label:{en:'',ru:'',es:''}, url:''}` entry to `state.draft.contact.links` — no icon picker in the UI since the icon is server-computed on save (Task 1); the tab can show a disabled preview label like "icon: auto" next to each link.

- [ ] **Step 5: Wire `bindContact()`** for the email input, add/remove link buttons, and a `Sortable` instance on the link list (`onEnd` reorders `state.draft.contact.links`), following the same patterns as Task 2 / existing list editors.

- [ ] **Step 6: Run tests, verify they pass**

- [ ] **Step 7: Run `npm run check`**

- [ ] **Step 8: Commit**

```bash
git add admin/public/content.js admin/test/ui-render.test.mjs
git commit -m "feat(admin): add Contact tab and drop email from About"
```

---

## Task 4: Public normalize layer — hero, contact, layout, worksOrder, split standalone works

**Files:**
- Modify: `js/content.js`
- Test: `tests/public-copy.test.mjs`

**Interfaces:**
- Produces: `window.normalizeCatalogue(source)` now also returns `hero: {intro}`, `contact: {email, links}`, `layout` (array, defaulted to the 5-id default when `source.layout` is absent so the public site tolerates a cache/older payload), and `works` grouping changes: `SITE.series` keeps only real series (no synthetic `__standalone` merge-in); a new top-level `SITE.standaloneWorks` array holds works with no `seriesId`, and a new `SITE.worksOrder` is the reconciled list of `{type, id}` used to interleave them (default: all series in `series` order, then all standalone works in catalogue order, when `source.worksOrder` is absent).
- Consumes: Task 1's `publicCatalogue()` output shape.
- Note: `window.applyAuthor` keeps using `about.role`/`about.intro` for the About block exactly as today; it must stop writing hero text from `about` — hero text now comes from `SITE.hero.intro` and is applied by `js/main.js`/`js/series.js`/`js/exhibition.js` directly, not through `applyAuthor`'s `[data-author-intro]` hookup (remove the hero figure's current reliance on `data-author-intro` double-binding described in the existing `public-copy.test.mjs` "hero" test — that test gets rewritten in this task).

- [ ] **Step 1: Write failing tests**

```js
// tests/public-copy.test.mjs
test('normalizeCatalogue defaults layout and splits standalone works from series', async () => {
  // ...vm bootstrap as existing tests...
  const source = { about:{name:{en:'A'}}, heroWorkId:null, works:[
    {id:'w1', title:{en:'Solo'}, description:{}, seriesId:null, image:'', thumbnail:'', width:1, height:1, sizes:[]},
  ], series:[], exhibitions:[] };
  const normalized = context.window.normalizeCatalogue(source);
  assert.equal(normalized.series.length, 0);
  assert.equal(normalized.standaloneWorks.length, 1);
  assert.deepEqual(normalized.layout.map(s => s.id), ['works','exhibitions','about','contact','shop']);
  assert.deepEqual(normalized.worksOrder, [{type:'work', id:'w1'}]);
});

test('normalizeCatalogue carries hero intro and contact separately from about', async () => {
  const source = { about:{name:{en:'A'}}, hero:{intro:{en:'Short'}}, contact:{email:'a@b.test', links:[{id:'l1',label:{en:'IG'},url:'https://instagram.com/a',icon:'instagram'}]},
    heroWorkId:null, works:[], series:[], exhibitions:[] };
  const normalized = context.window.normalizeCatalogue(source);
  assert.equal(normalized.hero.intro.en, 'Short');
  assert.equal(normalized.contact.email, 'a@b.test');
  assert.equal(normalized.contact.links[0].icon, 'instagram');
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement in `js/content.js`** — drop the `standalone` synthetic-group block (current lines ~27-30), instead building `standaloneWorks` directly from `works.filter(w => !w.seriesId)`; add `hero`/`contact`/`layout`/`worksOrder` to the returned object with the defaults described above, reconciling `worksOrder` client-side the same way the server does (filter ids no longer valid, append missing ones) since the public site must stay correct even against a stale cached response.

- [ ] **Step 4: Update the existing hero test** in `public-copy.test.mjs` ("published About intro updates both the hero and About block") to reflect that hero text now comes from `hero.intro`, not `about.intro` — split it into two assertions/tests: one for About's `[data-author-intro]`/`[data-author-description]` (unchanged), one for hero (new `[data-hero-intro]` hook, wired in Task 5).

- [ ] **Step 5: Run tests, verify they pass**

- [ ] **Step 6: Commit**

```bash
git add js/content.js tests/public-copy.test.mjs
git commit -m "feat(public): normalize hero, contact, layout and standalone works"
```

---

## Task 5: Public site — index.html + js/main.js (layout-driven sections, new hero, Works grid, Contact)

**Files:**
- Modify: `index.html`
- Modify: `js/main.js`
- Modify: `js/i18n.js`
- Modify: `css/styles.css`
- Test: `tests/public-copy.test.mjs`

**Interfaces:**
- Consumes: `SITE.layout`, `SITE.hero`, `SITE.contact`, `SITE.series`, `SITE.standaloneWorks`, `SITE.worksOrder` from Task 4.
- Produces: `js/main.js` exposes a `renderWorks()` function (replaces `renderSeries()`), a `renderContact()` function, a `renderNav()`/`applyLayout()` function that (a) builds the `<nav>` links from enabled `layout` entries in order and (b) reorders/hides the matching `<section>` DOM nodes to match.

- [ ] **Step 1: Rewrite the hero markup in `index.html`** — drop the `eyebrow`/`span.small-index`, drop the "View the series" CTA `<a>`; keep `#artist-name`, add a hero-intro element (e.g. `<p class="lede" data-hero-intro>`), keep the `hero-figure`/`#hero-image` block as-is (still driven by `heroWorkId`).

- [ ] **Step 2: Replace the hardcoded `<nav>` links and the 4 static `<section>`s** with 5 sections carrying stable ids (`#works`, `#exhibitions`, `#about`, `#contact`, `#shop`) and empty `<nav id="site-navigation">` (links injected by JS); update the `skip` link's `href` to `index.html#works` / `#works`; give `#about` and the new `#contact` section their own `<section class="section" id="contact"></section>` shell (About keeps its existing static layout markup minus the email link, which moves into Contact's JS-rendered content).

- [ ] **Step 3: Write failing tests** for the new nav/section behavior

```js
// tests/public-copy.test.mjs — test main.js's layout application in isolation if main.js is reasonably
// extractable via the same vm.runInContext pattern used for content.js, OR, if main.js is too DOM-heavy
// to sandbox cleanly, add the assertions as a small pure helper exported for testability
// (e.g. window.orderedLayout(layout) -> enabled entries in order) and test that helper directly:
test('orderedLayout keeps only enabled sections in their given order', () => {
  const layout = [{id:'shop',enabled:false},{id:'works',enabled:true},{id:'contact',enabled:true}];
  assert.deepEqual(window.orderedLayout(layout), ['works','contact']);
});
```

- [ ] **Step 4: Run test, verify it fails**

- [ ] **Step 5: Implement `renderWorks()` in `js/main.js`** — build the Works grid by walking `SITE.worksOrder`: a `type:'series'` entry renders a card whose cover is a work picked at random (client-side, each render) from that series' `works`, title = series title, count = work count, linking to `series.html?id=<id>`; a `type:'work'` entry renders a card for that standalone work, opening the existing `viewer` on click (reuse the existing `openViewer`/`data-open-work` wiring). Keep the existing empty-state message when `SITE.worksOrder` is empty.

- [ ] **Step 6: Implement `renderContact()`** — render `SITE.contact.email` as a `mailto:` link (reuse the pattern currently used for `#about-email`) and each `SITE.contact.links` entry as a link showing its translated label and an inline `<svg><use href="#icon-<icon>"/></svg>`; add the corresponding new `<symbol>` defs to `index.html`'s existing `.icon-definitions` block for each `socialIcon()` key from Task 1 (simple single-color line icons matching the existing arrow/sun/moon style).

- [ ] **Step 7: Implement `orderedLayout(layout)` and the nav/section application** — `orderedLayout` returns enabled ids in order; the render bootstrap uses it to (a) rebuild `<nav>`'s `<a>` children with the right `href`/`data-i18n` label per id (`nav.works`, `nav.exhibitions`, `nav.about`, `nav.contact`, `nav.shop`), (b) reorder the live `<section>` elements inside `<main>` to match via `appendChild`, and (c) `hidden`-toggle any section whose id isn't in `orderedLayout(layout)`.

- [ ] **Step 8: Fix cross-links that assumed fixed sections** — the Shop `review-request` link (`js/main.js:357`, currently `href="#shop"`) must resolve to the shop section only if Shop is enabled; if Shop is disabled, hide that link (shop itself isn't rendered when disabled, so this mainly matters if Shop is enabled but reached from another still-enabled section — confirm no section other than Shop itself links to `#shop`, and likewise check `#about`/`#exhibitions`/`#works` for any remaining hardcoded anchor in `main.js`/`css/styles.css`).

- [ ] **Step 9: Update `js/i18n.js`** — rename `series.label` usages that fed the homepage heading to a new `works.label`; drop `hero.cta`/`nav.series`; add `nav.works`, `nav.contact`, `contact.label`, and any copy needed for the Contact section headings, across `en`/`ru`/`es` (keep the existing "shared translations cover identical keys" test passing — run it, don't hand-roll key parity).

- [ ] **Step 10: Apply the `better-ui`/`better-layout`/`better-typography`/`better-colors` pass to `css/styles.css`** for the touched sections (hero, Works grid cards, Contact), per those skills' guidance — keep this change scoped to spacing/scale/contrast of what this plan touches, not a full-site redesign.

- [ ] **Step 11: Run tests, verify they pass** — `node --test tests/*.test.mjs`

- [ ] **Step 12: Manual verification in the browser** — serve the repo root as a static site, open `index.html`, confirm: hero shows name + short intro only (no eyebrow/button), Works grid shows series + standalone cards, clicking a series card navigates to `series.html?id=...` (built in Task 6), nav links match an enabled/ordered `layout` fixture, Contact renders email + a link with an icon.

- [ ] **Step 13: Commit**

```bash
git add index.html js/main.js js/i18n.js css/styles.css tests/public-copy.test.mjs
git commit -m "feat(public): layout-driven sections, simplified hero, Works grid, Contact block"
```

---

## Task 6: Public site — series.html detail page

**Files:**
- Create: `series.html`
- Create: `js/series.js`
- Modify: `js/content.js` (extract the series body/slideshow renderer so both the Works-grid cover-pick and the series page can share it)
- Test: `tests/public-copy.test.mjs`

**Interfaces:**
- Consumes: `window.normalizeCatalogue`, `window.applyAuthor`, `window.exhibitionLink`/arrow icon constant, the existing cart (`window.VKCart`) and i18n (`window.I18N`) globals — same bootstrap as `js/exhibition.js`.
- Produces: `window.renderSeriesBody(series, lang)` (or equivalent name) in `js/content.js` — a pure function returning the HTML for a series' statement + slideshow, extracted from `js/main.js`'s current `renderOneSeries`/`renderSlideshow`/`renderGallery` so `series.html` doesn't duplicate that markup logic. `js/main.js`'s Works-grid card renderer (Task 5) only needs the series' `works` array for its random-cover pick, not this function.

- [ ] **Step 1: Write a failing test for the extracted renderer**

```js
// tests/public-copy.test.mjs
test('renderSeriesBody renders the series statement and all its works', async () => {
  // vm bootstrap content.js; call window.renderSeriesBody({statement:{en:['Para one']}, works:[{id:'w1', title:{en:'Work'}, image:'', thumbnail:'', width:1, height:1, description:{en:''}}]}, 'en')
  // assert the HTML contains 'Para one' and a work entry for 'w1'
});
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Extract the renderer into `js/content.js`**, moving the body of `renderOneSeries`'s statement+slideshow branch and `renderSlideshow`/`renderGallery` (currently in `js/main.js`) into a shared function callable from both `main.js` (if still needed for any in-page use) and `series.html`. `js/main.js`'s own callers are updated to use the extracted function so there's one implementation.

- [ ] **Step 4: Run test, verify it passes**

- [ ] **Step 5: Create `series.html`**, copied from `exhibition.html`'s structure (same `<head>`, header/nav markup reused from `index.html` post-Task-5, same `<dialog id="exhibition-viewer">`-equivalent for the lightbox if the series slideshow needs one, footer, same script includes plus a new `js/series.js` instead of `js/exhibition.js`).

- [ ] **Step 6: Create `js/series.js`**, mirroring `js/exhibition.js`'s structure: read `?id=` from the query string, fetch/normalize the catalogue the same way, find the series by id, render via `window.renderSeriesBody` plus a title/back-link header (back link target: `index.html#works`), handle the "series not found" state the same way `exhibition.js:14` does, wire language/theme toggles the same way.

- [ ] **Step 7: Manual verification** — open `series.html?id=<a-real-series-id>` against a running catalogue and confirm the statement + slideshow render, language/theme toggles work, and the back link returns to the Works grid.

- [ ] **Step 8: Run full public test suite** — `node --test tests/*.test.mjs`

- [ ] **Step 9: Commit**

```bash
git add series.html js/series.js js/content.js js/main.js tests/public-copy.test.mjs
git commit -m "feat(public): add series.html detail page, extracted from the homepage accordion"
```

---

## Task 7: Seed data migration + end-to-end Studio regression test

**Files:**
- Modify: `admin/seed/catalogue.json`
- Test: `admin/test/content.test.mjs`

**Interfaces:**
- Consumes: Task 1's `normalizeCatalogue`/`publicCatalogue`.
- Produces: nothing new — this task only adds data/coverage.

- [ ] **Step 1: Write a failing end-to-end test** using the `fixture()` helper already in `admin/test/content.test.mjs`: provision a studio with seeded content, `GET /api/studio/content`, assert the returned `draft.hero`, `draft.contact`, `draft.layout`, `draft.worksOrder` are present and well-formed (same shape assertions as Task 1's unit tests, but through the real HTTP/SQLite path), then `PUT` an updated `layout` (reordered, one section disabled) and a new `contact` link, and assert `POST /api/studio/publish` → `GET /api/catalogue` reflects both.

- [ ] **Step 2: Run test, verify it fails** (seed data predates the new fields, or the route round-trip breaks some assumption)

- [ ] **Step 3: Update `admin/seed/catalogue.json`** to include a sensible seeded `hero.intro`, `contact.email`/no links (or one example link), and the default `layout`/`worksOrder` — matching whatever defaults Task 1 computes, so the first-run seed is consistent with what a migrated old install ends up with.

- [ ] **Step 4: Run test, verify it passes**

- [ ] **Step 5: Run the full admin test suite** — `cd admin && npm test && npm run check && npm run build`

- [ ] **Step 6: Commit**

```bash
git add admin/seed/catalogue.json admin/test/content.test.mjs
git commit -m "test(admin): seed data and end-to-end coverage for layout/contact/hero"
```

---

## Task 8: Full regression pass and cleanup

**Files:** none new — verification only, plus any small fixes the pass turns up.

- [ ] **Step 1: Run the entire test matrix** — `node --test tests/*.test.mjs` (repo root) and `cd admin && npm test && npm run check && npm audit --omit=dev` (per `admin/README.md`'s own "Проверки" section).

- [ ] **Step 2: Manual browser pass** against a locally running studio (`npm start` in `admin/`) + the static public site: toggle each of the 5 sections off/on and drag-reorder them in the Layout tab, confirm the public homepage nav/section order follows; add/remove/reorder Contact links and confirm icons and order match on the public site; edit the hero intro and confirm it updates independently from the About block's intro; open a series card into `series.html` and back; buy-flow smoke test in Shop still works when Shop is enabled.

- [ ] **Step 3: Fix anything the pass surfaces**, each fix as its own small commit following the existing patterns.

- [ ] **Step 4: Final commit** (only if Step 3 produced changes)

```bash
git add -A
git commit -m "fix: address issues found in layout/hero/works/contact regression pass"
```

---

## Self-Review Notes

- **Spec coverage:** Layout tab + toggles/order (Task 2), hero independence (Tasks 1, 4, 5), Works = series+standalone grid with drag-reorderable order and random cover (Tasks 1, 4, 5), series detail page (Task 6), Contact block with auto-icon (Tasks 1, 3, 5), nav item disappearing when a section is disabled (Task 5), visual density pass via `better-*` skills (Task 5 step 10) — all covered. Default section order/visibility and migration of old catalogues covered in Task 1/7.
- **Review Focus coverage:** old-catalogue migration → Task 1 Step 5 test + Task 7; stale `worksOrder` reconciliation → Task 1 Step 7 test; disabled-section dead links → Task 5 Step 8; unrecognized-domain Contact link → Task 1 Step 1/5 tests; empty/all-series/all-standalone Works grid states → Task 5 Step 5 implementation note (covered by existing empty-state plus the mixed-case test in Task 4; an explicit all-series/all-standalone test is left to the builder's judgment during Task 5 manual verification since it's a rendering, not validation, concern).
