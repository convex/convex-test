---
"convex-test": patch
---

Match version-dependent scheduled mutation self-cancellation: Convex 1.50+ throws and rolls back uncaught failures, while older versions warn and ignore the cancellation. Accept future function references using Convex’s exported types and signature helpers. This requires Convex 1.46.0 or newer; the peer dependency is now `^1.46.0`. Support action and HTTP action service token/URL syscalls with an unsigned test JWT and a reserved `.test` URL.
