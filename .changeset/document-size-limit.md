---
"convex-test": patch
---

Reject user documents larger than 1 MiB on `insert`, `patch`, and `replace`, matching Convex's document-size limit. Size includes system fields and counts strings in UTF-8 bytes. Fixes #176. (#183, thanks @Mohith26!)
