# Series editing and contextual units

User requests exhibition-style separate series list/editor, label “Добавить из загруженных”, moving sm/inch from header to print sizes, and a serif font suggestion.

- Reuse list/editor routing for /series and /series/:id/edit. Related-work list, shared picker, detach, new work modal, archive/restore and archived permanent deletion. Confirm transfers from other series; preserve catalogue work records.
- General owner-only archive endpoint supports series/exhibitions with optimistic version checking and target-only public visibility changes. Keep previous exhibition endpoint compatible.
- Remove header measurement controls. Add sm | inch beside shop sizes and work viewer offers; synchronize preferences and values across contexts, preserve units after reload. Fix wrapping of long exhibition titles found with actual public content at 320px.
- Font proposal: Literata Regular from TypeTogether, suggested but not applied because user asked for a proposal.
- Verification: 32 HTTP/auth/content tests pass locally; browser passes series URL/list/new/save/reload/transfer confirm-cancel/detach/archive/delete and previous exhibition flow, plus contextual unit conversion/persistence in shop/viewer at 320/375/768/1024/1440 with no runtime errors. Deploy using full source/data backup; preserve real production records.

Deployment: all 32 tests also pass in the Linux Node 24 production image. Studio updated with full data/source backup and previous image tag before-series-units. No production catalogue edits or font changes were made during verification.
