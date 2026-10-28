# Content workflow repair — 2026-10-28

User authorizes fixing saving, uploads, direct publication, exhibition work editing, whole-number dimensions and header metric/imperial choice.

1. Reproduce direct publication and unfinished-draft failures with real HTTP tests. Allow incomplete titles/dates in private drafts; validate at publication. Publish the submitted document atomically with optimistic version checking, preserving prior public data on errors.
2. Make Publish send current edits directly. Add finite request/upload timeouts, progress, immediate local previews and filename-based editable titles. Open exhibition work editor in a modal with thumbnails and keyboard-close support.
3. Display whole dimensions while retaining exact aspect ratios internally. Add remembered cm/in switch to public header; convert all shop/request size labels consistently. Refresh catalogue when returning to the public page.
4. Run backend and real-browser regression flows, including save/reload, direct publish/public fetch, drag/drop/modal and responsive layout. Back up production, deploy without changing credentials or existing content; push main and verify live assets/API.

## Verified implementation

- Reproduced old direct-publication failure with a failing HTTP test (submitted edits ignored) and a browser assertion (Publish disabled when dirty). Confirmed production had 13 media records but only 10 saved/published works.
- Private incomplete drafts now persist; direct publish validates and atomically writes submitted draft/public snapshot. Added conflict and invalid-publication coverage.
- Shared Add work modal for library, series and exhibitions; immediate local preview/progress, filename title, thumbnails, existing-work editor, explicit draft/publish buttons, Escape, retry errors and recovery of unassigned uploads.
- Whole-number dimension labels and remembered public CM/IN choice; exact ratios retained internally. Public refresh on focus/visibility and 30-second interval, unchanged snapshot avoids unnecessary rendering.
- 27 real HTTP/auth/content tests pass on Windows Node 22 and production Linux Node 24 image. Real Edge browser tests pass: click/drop, modal add/edit from all three contexts, direct publication/public refresh, incomplete draft reload, units/persistence, upload failure, responsive 320/375/768/1440 widths, no JS errors.
- Production source and complete data volume backed up under /root/vitalykrauss-studio-backups/workflow-*. Previous image retained as vitalykrauss-studio:before-workflow. Updated only studio service; existing owner credentials, media and catalogues preserved. No test content published to production.
