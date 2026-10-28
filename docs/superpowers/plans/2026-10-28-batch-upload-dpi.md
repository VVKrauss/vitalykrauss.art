# Batch upload and DPI — 28 October 2026

Works and exhibition photos accept multiple files through the same click/drop pipeline. Files process sequentially with per-file previews and failures; successful images survive failures elsewhere in the batch. Work titles preserve the filename except its extension.

Original pixels and embedded DPI determine the initial maximum physical size. Missing DPI defaults to 300; owners can change it. Existing formats/prices remain intact until explicit recalculation. Print export respects selected DPI and never enlarges source pixels. Public previews remain stripped and limited to 1400px.

Verification: 35 backend tests passed locally and in the production Linux image. Browser fixture checked mixed successful/invalid batches, Unicode filenames, library/series/exhibition association, price preservation, direct publish and widths 320/375/768/1440 without overflow. Production deploy backs up source and private volume before migration/restart.
