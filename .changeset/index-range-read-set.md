---
"convex-test": patch
---

Count the index-range limit (`databaseQueries`, 4,096) on the transaction's read set, like the backend: reading the same document or the same index range again in one transaction, including from a nested query or mutation, no longer counts another range. Repeated reads still count toward the document and byte limits. Before, every `db.get` and every query counted, so code that rereads a few documents many times, such as `@convex-dev/aggregate` inserts, threw "Too many index ranges" in tests while running fine on Convex.
