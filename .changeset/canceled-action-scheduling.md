---
"convex-test": patch
---

Tasks scheduled after their parent action is canceled now start canceled and never execute, including scheduling through nested calls and components. Scheduling still returns a job ID, and work scheduled before cancellation continues to run.
