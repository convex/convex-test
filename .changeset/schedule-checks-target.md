---
"convex-test": patch
---

`ctx.scheduler.runAfter` and `runAt` now check that the target function exists when it is scheduled, as the Convex backend does. Scheduling a missing module, a missing export or a malformed function handle now throws in the calling function instead of failing later when the job runs.
