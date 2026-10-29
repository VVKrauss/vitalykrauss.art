# Exhibition place and slideshow alignment

29 October 2026. Centre slideshow thumbnail strips using auto margins on the first/last thumbnail. Short strips centre; overflowing strips retain reachable endpoints and existing active-thumbnail scrolling.

Exhibitions gain optional EN/RU/ES country alongside venue and city. Normalize missing legacy country to empty; keep existing published data intact. Shared public helpers format date range · venue, city, country on list and detail pages; shop and request snapshots include country too. On narrow screens the metadata paragraph wraps naturally.

Verification: 41 Studio integration tests and 3 public tests pass. Browser fixture edits/publishes country through Studio, verifies list/detail text, tests thumbnail centring at 320/375/768/1024/1050/1440, and passes existing upload/reorder/avatar/cart/request/swipe checks with no JS/CSP errors. No overflow. Source/private-volume backup precedes deployment; do not populate countries by guessing or alter production catalogue for tests.
