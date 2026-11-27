---
"convex-test": patch
---

Pin query and mutation time to the test clock at transaction start. With fake timers frozen, `Date.now()` inside a transaction stays aligned with the test clock even after multiple commits in the same millisecond. Commit timestamps still increase independently.
