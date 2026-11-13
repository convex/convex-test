---
"convex-test": patch
---

Match version-dependent scheduled mutation self-cancellation: Convex 1.50+ throws and rolls back uncaught failures, while older versions warn and ignore the cancellation. Accept future function references without raising the Convex peer dependency. Support action and HTTP action service token/URL syscalls with an unsigned test JWT and a reserved `.test` URL.
