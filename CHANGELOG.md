# Changelog

# Unreleased

- Pin `Date.now()` and `new Date()` for each query or mutation, including nested
  calls and `t.run`, at or after the transaction's snapshot timestamp.

## 0.0.62

- Return typed component references from registerComponent (#161)

## 0.0.61

- Define a full test application with inline functions and schema without
  generated files or an `import.meta.glob`. `defineTestApp` provides
  schema-bound function builders, typed function references, component
  registration, and fresh `convexTest` instances. Used primarily when testing
  libraries and components that want to have a simple app to test with. (#140)
- Prevent components from calling .paginate() (#157)
- Fix text search on missing or non-string fields (#156)

## 0.0.60

- Improves the implementation of `finishAllScheduledFunctions` to avoid false positives in the hung scheduled function detection.

## 0.0.59

- Improves global isolation, improving interactions with vitest.stubGlobal (#142).
- Implements `ctx.meta.getRequestMetadata()` by introducing `t.withRequestMetadata`
  with the IP, user agent, and identity's auth token(#134, #135, #136)

## 0.0.58

- Globals modified within query/mutation/actions (e.g. for Workflow) are now
  scoped so they don't contaminate other functions or tests.
- Queries and mutations now throw when calling `fetch`, `setTimeout`,
  `clearTimeout`, `setInterval`, or `clearInterval`. These restrictions also apply
  to `t.run` and inline `t.query` / `t.mutation` callbacks. Move test setup that
  fetches data or waits on timers into the test body before calling these methods.
  Use actions for application code that needs these APIs; scheduling through
  `ctx.scheduler` remains supported.
- The return value of `t.withIdentity(identity)` now has a `.withIdentity`
  method itself, which also returns context for function calls for a particular
  identity. We made that change because we will soon add more methods in
  `TestConvexForDataModel`, and we want for these methods to be callable
  in any order.
- Add implementation for `ctx.meta.getRequestMetadata()` in mutations, actions
  and HTTP actions. Every call from the test starts a new request, and the
  functions it calls share the request's `requestId`, components included.
  Scheduled functions run as their own request, with their
  `_scheduled_functions` document ID exposed as `scheduledFunctionId`.
- Add `t.withRequestMetadata({ ip, userAgent })`, which returns an accessor
  whose calls report the given IP address and user agent.
- `t.withIdentity(identity)` now also gives the request an `authToken`: an
  unsecured JWT carrying the identity's claims, so that functions which read
  the raw token can be tested.

## 0.0.57

- Reject function `args` validators that aren't an object or `v.any()`, matching
  the error the real backend raises at push time. Previously e.g. a top-level
  `v.union(...)` args validator worked in tests but failed to deploy. (#138)
- Support upcoming feature ctx.meta.getSnapshotTs()

## 0.0.56

- Document the second parameter to `finishAllScheduledFunctions`

## 0.0.55

- Support `db.vars.commitTs` and `v.commitTs()`.
- Fix an issue where `finishAllScheduledFunctions` would drop functions
  scheduled under real timers.

## 0.0.54

- Support the `transactionLimits` option on nested `ctx.runQuery` /
  `ctx.runMutation` calls (Convex 1.41). The nested call is enforced against
  its own limits, capped at the global transaction limits so they can only be
  lowered, never raised.
- Bandwidth tracking now mirrors the database's nested-transaction layers: a
  nested call's usage folds into its parent only when it commits, so the writes
  of a rolled-back nested `ctx.runMutation` no longer count against the
  transaction's limits.
- Enforce the Convex runtime rule that a single function execution may only
  run one paginated query (`.paginate()`). Calling it more than once now
  throws, catching a production-only failure that previously passed silently
  in tests.

## 0.0.53

- Support scheduled functions correctly with or without fake timers,
  by always serializing scheduled mutations with the global transaction
  manager.

## 0.0.52

- Add implementation for `ctx.meta.getDeploymentMetadata()`.
- Add support for internal audit log syscall.

## 0.0.51

- Add implementation for internal snapshot query syscall.

## 0.0.50

- Correctly deserializes ConvexError thrown within nested functions.
- Fixes a bug where orphaned scheduled functions would eventually fire
  and hit "Cannot read properties of null (reading 'state')".

## 0.0.49

- Changes the test ID formatting to not include a `;` and be the
  standard length of regular IDs for folks who have validators.

## 0.0.48

- Add implementations for internal syscalls for upcoming ctx.meta
  features (ctx.meta.{getFunctionMetadata,getTransactionMetrics})

## 0.0.47

- Fix: Isolate function stack tracking between parallel function calls
  to prevent corruption when calling different components in parallel.
  This may have presented previously as not being able to find modules
  that existed but were being resolved for the wrong component.

## 0.0.46

- Changes `finishAllScheduledFunctions` to pump the macrotask queue instead
  of microtask queue to enable dynamic imports to resolve, which regressed
  in 0.0.45.

## 0.0.45

- Replaces global usage with AsyncLocalStorage-scoped test state for isolation.
  Now tests shouldn't fail due to dirty state left behind by other tests.
- Better support for setTimeout usage within tested functions
- Improves typing for inline calls to t.mutation(() => {}) to be a union
  instead of overload so `TestConvex<SpecificSchema>` is assignable to
  `TestConvex<GenericSchema>`.

## 0.0.44

- More correctly implements nested transactions and parallel calls.
- Starts validating return validators.
- Propagates auth more correctly between callsites-not scheduler or components.

## 0.0.43

- Support pagination when documents may be deleted by using the values as the cursor
  instead of the ID.

## 0.0.42

- Supports running inline functions via `t.action((ctx) => {...})` to aid in testing
  code that expects an action environment. Also works in t.query and t.mutation
- Support for PaginationOptions maximumRowsRead & maximumBytesRead, as well as
  page splitting.
- Supports setting and enforcing transaction read/write limits within tests.
- Fix: Finish actions cleanly when they throw
- Replaces the compareValues implementation with the one now in "convex/values"

## 0.0.41

- Removes ActionCtx support for now. Calling component actions was not working correctly.

## 0.0.40

- Extends ctx in t.run to conform to both MutationCtx and ActionCtx.

## 0.0.39

- Adds support for using the upcoming ctx.db syntax where you pass explicit table names.
- Improves text search implementation to more closely match Convex text search: case insensitive, splitting whitespace and handling undefined in withIn
  ex.

## 0.0.38

- Implements the hidden .count() function.
- Supports unions on args at the top level.

## 0.0.37

- Allow system fields fields in schema. This isn't an intended use case but convex-test should match the runtime behavior of the convex runtime when possible.

## 0.0.36

- Fix a bug around serialization of arguments to scheduled functions.

---

Previous versions are documented in git history.
