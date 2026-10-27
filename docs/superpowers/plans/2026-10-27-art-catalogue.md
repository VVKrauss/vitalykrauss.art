# Art catalogue design and implementation plan

Goal: an airy, paper-toned artist catalogue with a light default theme and a thumbnail-driven shop. User selected art catalogue and authorized design refactoring on 2026-10-27; catalogue administration is explicitly deferred.

Architecture: retain static HTML, CSS and vanilla JavaScript and the existing GitHub Pages deployment. Keep catalogue content in js/content.js. No services or dependencies added.

Design: warm paper, graphite typography, generous responsive margins, fine rules, rectangular uncropped artworks. Retain serif headings and restrained sans-serif labels. Dark theme is optional and remembers the visitor's choice. Series and shop use a stable viewing area and thumbnail strip. Shop details sit beside the artwork on desktop and below on mobile. No autoplay. Preserve EN/RU/ES and requests without payment. Studio contact: kraussvitaliy@gmail.com. Follow-up: prints only, independent size variants with individual prices and request quantities, no header request button, and a translated About section. Size and price options remain demonstration data.

Alternatives considered: white gallery, paper art catalogue (selected), strict minimal studio. Administration options were discussed and deferred by the user.

## Tasks
- [x] Update index.html: theme initialization and toggle, editorial hero, footer contact.
- [x] Update css/styles.css: paper/dark tokens, responsive editorial composition, thumbnail galleries, shop and dialogs, better-ui states and reduced motion.
- [x] Update js/main.js and js/content.js: translated labels, theme control, reusable thumbnail gallery, independent shop selection and format controls, contact.
- [x] Validate JavaScript syntax and browser flows: themes and reload, series navigation, shop thumbnails/arrows/keyboard/swipe, format availability, requests and mail recipient, all languages, desktop/mobile overflow and image proportions.

## Review focus
Portrait and landscape artworks must fit without clipping or layout jumps. Selecting a thumbnail must preserve focus and page position. Theme changes must not animate the entire page. Sold items must remain unavailable. Dialogs and navigation must fit narrow phones. The mail handoff must not imply an actual email was sent.

## Verification
Use installed browser tooling without adding dependencies to the project. Browser plugin is not available; use Playwright. Save screenshots and temporary validation scripts outside the repository. No deployment or remote changes are included.

Completed with Playwright using installed Edge: widths 320, 375, 768, 1024, 1440; all three languages; theme persistence; all ten artwork proportions; sold offers; empty/invalid requests; quantity changes; intercepted mailto recipient and contents; modal and gallery focus; synthetic touch direction; reduced motion and press feedback at 10% playback speed. JavaScript syntax and git diff whitespace checks passed. Independent review found request-opener focus loss and 1–3px narrow-header overflow; both reproduced and fixed, then verified. Real mail application handoff, physical touch devices, and Safari/Firefox were not verified.
