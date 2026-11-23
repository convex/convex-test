---
"convex-test": patch
---

Validate record keys and values in function arguments, return values, and schema writes, matching the backend: `undefined` entries are ignored, and record validators with non-string or string-literal keys are rejected. Mutations whose return value fails validation now roll back their writes, and bigint literal validators now match bigint values.
