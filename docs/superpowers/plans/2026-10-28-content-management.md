# Content management implementation contract

User approved content requirements and selected manual entry of one print dimension in cm. Build on existing Better Auth studio; preserve existing authentication and public art catalogue style. User selected drop/click file uploads, required artwork titles, descriptions, series, multiple exhibitions, unlimited poster availability, archive, per-size prices, proportion preservation, private original uploads, smaller web copies, explicit save/publish and featured-artwork switch with replacement confirmation. Existing ten works/two series/three exhibition records must be imported. Use supplied VK logo in header, maintaining its shape. No payment.

## Architecture and alternatives
SQLite stores one versioned draft document and one separately published snapshot, plus private media records. Public static site reads only published JSON and web derivatives from studio; no Git token or publication pipeline is needed in the admin. Alternative Git-based publishing was rejected as slower and requiring repo-write credentials. Original files and print exports require owner authentication. Media files live under the existing persistent data directory. Publishing is an explicit owner POST, not every edit. Admin data and images never join GitHub Pages artifact. Current public catalogue remains a bootstrap fallback if no published service data is available.

## Shared document contract
All text dictionaries are {ru:string,en:string,es:string}; nonempty title in at least one language required, fallback ru then en then es. Other translations optional. Arrays preserve display order. IDs are opaque strings, existing IDs kept, new UUIDs allowed.

```
Catalogue = {
 heroWorkId: string|null,
 works: [{id,title,description,year:string,seriesId:string|null,mediaId:string,
          maxWidthCm:number|null,maxHeightCm:number|null,
          sizes:[{id,widthCm:number,heightCm:number,price:number|null}],archived:boolean}],
 series: [{id,title,description,collaborator:string,archived:boolean}],
 exhibitions: [{id,title,description,startDate:string,endDate:string,
                venue:Text,city:Text,workIds:string[],archived:boolean}]
}
```

Images: POST /api/studio/media, multipart field file, one image/request; return media object {id,filename,width,height,originalAvailable,previewUrl,thumbnailUrl}. GET /api/studio/content returns {version,draft,publishedAt,media:[Media]}. PUT /api/studio/content body {version,draft} validates every reference and ratio, saves draft and increments version; response same shape. Stale version =>409, validation=>400 {error:Russian readable string}. POST /api/studio/publish body {version} publishes saved draft with same response; no implicit saving. Preserve form edits client-side on request failure. New uploaded images not in any saved draft remain private. Server rejects unknown IDs and ratios not within .5%; computes maxHeightCm from maxWidthCm and actual image dimensions. Positive sizes cannot exceed maximum. Price either null/empty or positive numeric EUR. No inventory or edition controls.

GET owner /api/studio/media/:id/web.webp and thumb.webp provides previews. GET owner /api/studio/media/:id/original downloads true originals if present. GET owner /api/studio/works/:workId/print/:sizeId exports image within original pixels, up to 300dpi, no enlargement; existing imported web-only works have originalAvailable=false until replacement upload. Public GET /api/catalogue returns {heroWorkId,works,series,exhibitions,publishedAt}; works include {image,thumbnail,width,height} and sizes but no mediaId/original details. Public image URLs are absolute /media/:id/web.webp and thumb.webp on the configured studio origin. Only media referenced by current published active works are public. CORS wildcard on public JSON only (no credentials). Archived works/exhibitions/series omitted; reference arrays sanitized. Archived series do not prevent otherwise active works appearing in shop. Shop includes only works with at least one priced size. Standalone works supported. Multiple exhibitions displayed in card metadata with venue/city. Gallery/modal and request identify work+size; price revalidated on catalogue load/change and unavailable request entries removed.

## UI
Admin tabs Works, Series, Exhibitions, Access. Shared live draft with explicit Save and Publish, unsaved indicator; do not discard unsaved edits on tab refocus. Work upload dropzone clickable file input, multiple upload batches processed sequentially, previews, required names before save. Editor has translations, title/description, optional series, uploaded image, max width/height (one edits other calculated), sizes auto aspect ratio and price, archive/restore, real role=switch hero toggle. Replacing hero opens a proper confirmation dialog naming old/new work; cancellation preserves old hero. Archiving featured work asks to first choose another or explicitly clear hero. Exhibition editor selects existing works and adds new uploads through same dropzone; new works require title and remain in library. Date accepts YYYY-MM-DD or existing YYYY precision. Series editor title/description/collaborator/archive, catalogue list reorder if straightforward. Archive filters provide restore. Do not invent biography/content. Preserve better-ui press/focus/reduced-motion conventions.

## Work division
- Backend: admin/src/catalogue*.mjs, media.mjs, content-routes.mjs; integrate studio/config; migration seed+script, dependencies, tests, Docker and deploy.
- Admin UI: admin/public/content.js and content.css; integrate public/index.html and public/app.js with content start/reset hooks. Own logo integration in admin only if root logo asset supplied later.
- Public site: index.html, css/styles.css, js/main.js and js/content.js; logo asset under images; fetch public JSON, render galleries/shop/exhibitions/features and bootstrap current catalogue. Do not change admin backend/frontend.

## Validation
Real HTTP/SQLite/multipart tests for draft/publish isolation, optimistic concurrency, uploads disguised as nonimages/SVG, dimensions, original privacy, archive/public media revocation, shop pricing filter, hero invariants, source data migration, authenticated exports. Browser test CRUD, drop/click upload, missing title, no price vs shop, sizes/ratios, save/reload, publish, hero confirmation cancel/accept, exhibition linking and new uploads, archive/restore, mobile and authentication regression. Independently review before deploying. Backup production DB+volume before first upgrade; never replace/reset owner, secret or existing passkeys. Raise only studio request-body limit for image uploads, leaving SciPay untouched. Deploy public JS/logo through Pages main after verification; rollback builds/database backup if needed.

## Completion evidence

Implemented and deployed on 2026-10-28. All 25 tests pass on Windows/Node22 and inside the Linux/Node24 deployment image; production data is not mounted in test containers. Real authenticated browser flow passes uploads by input and DataTransfer drop, required titles, maximum and smaller sizes, hero confirmation cancel/accept, series/exhibition editing and new exhibit uploads, save/publish isolation, archive/restore, public shop metadata/request and mobile viewports. A hidden .data directory is used in media tests to match production file serving. CI for studio checks and GitHub Pages deployment succeeded for 8957e8c.

Independent review findings resolved: upload lock is not released by client disconnect; public derivatives use no-store; maximum-size insertion obeys total size-count limit; reserved gallery IDs rejected. Auth volume and source were backed up privately on VPS before migration, rollback image retained. Credential/passkey fingerprints matched before and after. Studio imports existing 10 works/2 series/3 exhibitions exactly once, without changing owner access. Existing old sizes were proportion-corrected; original price values retained; initial exhibition-to-work links remain unset rather than invented. Originals for those imported web-only works must be supplied by the owner.

Live verification: studio API and all ten WebP derivatives return 200 with correct CORS/no-store; anonymous content routes return 401; private file paths return 404. Public site reads real published data, displays supplied exact logo, all existing works and request workflow; mobile dark theme has no overflow/runtime errors. Caddy upload path is limited to 105 MB, other studio requests to 3 MB. Studio is healthy without host port bindings; SciPay still returns 200. No test records were published to production. Physical print quality and real-device passkey ceremonies remain user-specific and were not claimed verified.
