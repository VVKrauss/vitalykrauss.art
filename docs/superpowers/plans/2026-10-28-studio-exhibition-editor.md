# Focused exhibition editor

User requests borderless header logos, only attached exhibition materials in editor, separate exhibition list/edit pages, icon-only upload zones, and consistent thin up-right arrows on tablets.

- Remove logo image outline only, preserving keyboard focus on the link. Render diagonal arrows as inline SVG paths, independent of system fonts/emoji, across public/admin links.
- Exhibition list at /exhibitions has edit/archive/new actions, archive filter and archived permanent-delete actions. Full editor at /exhibitions/:id/edit uses same protected app shell/API and supports direct reload/history. Keep in-memory drafts across navigation; save/publish remain explicit in editor.
- Attached-work rows contain only selected work IDs in selected order. Remove link without deleting work. Dedicated catalogue picker with thumbnails, cancel/apply; new work modal still shared and attached to parent exhibition.
- Upload zones show a picture SVG only; accessible file input retains descriptive label and drag/drop behaviour, preview/progress/toasts remain intact.
- Owner-only optimistic archive endpoint updates target exhibition visibility in public snapshot, saving other edits privately. No accidental full draft publication from list action.
- Verification: HTTP test reproduces absent archive endpoint then passes target-only archive/restore, stale protection and direct editor shell. 31 HTTP tests pass locally. Real browser covers list/editor URL/reload/back/forward, attached-only rows, picker, detach, new work and photos, new exhibition, archive/restore, permanent-delete cancel/confirm, 320/375/768/1024/1440 layouts, no JS errors. Existing public portrait/gallery flow also passes.

Deployment verification: all 31 tests pass in the actual Linux Node 24 image. Updated studio with full source/data backup and prior image before-editor-pages; final browser layout hides the generic welcome on exhibition screens to keep focus on the list/editor. Existing owner data and credentials were preserved; no production exhibition was edited for testing.
