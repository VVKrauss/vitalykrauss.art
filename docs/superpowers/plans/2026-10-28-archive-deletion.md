# Permanent archive deletion

User requests irreversible deletion with confirmation for archived works, series and exhibitions.

- Owner-only POST /api/studio/delete accepts optimistic version, current draft, kind and id. Normalize as private draft; reject active/missing records and stale versions. Atomically remove target from draft and public snapshot, preserve unrelated public data, save other current edits privately.
- Work deletion clears hero and exhibition links. Series deletion detaches works without deleting them; exhibition deletion preserves works. Remove original/web/thumb plus media record only when neither snapshot references that image, including old published image after an unpublished replacement.
- Show destructive button only for archived records. Named confirmation explains irreversible effects and immediate public removal. Cancel/Escape preserves data. Existing busy/error handling preserves local edits on request failure.
- Verify HTTP tests for auth/Origin, active/stale rejection, links, shared media, physical file removal, unrelated private edits; browser confirms all three kinds, cancellation, persistence, mobile widths and no JS errors. Deploy with source and volume backup; never exercise production deletion on user records.

Verification: 29 tests pass locally and in the actual Linux Node 24 deployment image. Edge checks cover active-button absence, archive/confirm/cancel, immediate work/series/exhibition deletion, persistence after reload, preserved related works, responsive 320/375/1440 widths and zero runtime errors. Existing add/edit/publish browser flow also passes. Deployed studio only, with source and complete volume backups under archive-delete-* and previous image tag vitalykrauss-studio:before-archive-delete. No production record was deleted for testing.
