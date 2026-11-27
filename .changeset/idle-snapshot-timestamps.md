---
"convex-test": patch
---

Advance snapshot timestamps at outermost transaction entry even without writes. Empty databases now receive current snapshots, and snapshot-bounded queries can find due work after fake time advances without an empty mutation. Snapshots remain fixed across nested and component calls, and future commits stay strictly later even after queries, rollbacks, or backward clock changes. Pinned transaction time remains at or after the snapshot. (#222)
