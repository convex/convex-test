---
"convex-test": patch
---

Fix module discovery picking a local component's `_generated` directory as the app root when it sorts before the app's own `_generated` directory. The shallowest `_generated` directory is now used. (#223)
