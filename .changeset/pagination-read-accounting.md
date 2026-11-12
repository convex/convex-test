---
"convex-test": patch
---

Count documents rejected by pagination filters toward transaction read metrics and limits. Preserve the complete interval when an end cursor is supplied, while continuing to enforce transaction-wide limits. (#199)
