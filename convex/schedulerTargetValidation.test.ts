import { expect, test } from "vitest";
import { anyApi, createFunctionHandle } from "convex/server";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

// The real backend checks that a scheduled function exists when it is
// scheduled (`validate_schedule_args`), so `runAfter` throws inside the
// calling mutation and no job is written. convex-test should fail at the
// same point instead of when the job runs.

function scheduleNow(target: any, args = {}) {
  return async (ctx: any) => {
    await ctx.scheduler.runAfter(0, target, args);
  };
}

async function scheduledJobs(t: ReturnType<typeof convexTest>) {
  return await t.query((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
}

test("scheduling a missing export fails at schedule time", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(scheduleNow(anyApi.scheduler.doesNotExist)),
  ).rejects.toThrow(
    "Attempted to schedule function, but no exported function doesNotExist " +
      "found in the file: scheduler.js. Did you forget to export it?",
  );
  expect(await scheduledJobs(t)).toEqual([]);
});

test("scheduling a function in a missing module fails at schedule time", async () => {
  const t = convexTest(schema);
  await expect(t.mutation(scheduleNow(anyApi.noSuchModule.fn))).rejects.toThrow(
    "Attempted to schedule function at nonexistent path: noSuchModule.js",
  );
  expect(await scheduledJobs(t)).toEqual([]);
});

test("scheduling a string that is not a handle fails at schedule time", async () => {
  const t = convexTest(schema);
  await expect(t.mutation(scheduleNow("not-a-handle"))).rejects.toThrow(
    /nonexistent path: not-a-handle/,
  );
  expect(await scheduledJobs(t)).toEqual([]);
});

test("scheduling a malformed handle fails at schedule time", async () => {
  const t = convexTest(schema);
  await expect(t.mutation(scheduleNow("function://garbage"))).rejects.toThrow(
    'Invalid function handle: "function://garbage"',
  );
  expect(await scheduledJobs(t)).toEqual([]);
});

test("scheduling a handle to a missing function fails at schedule time", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(scheduleNow("function://;scheduler:doesNotExist")),
  ).rejects.toThrow(/no exported function doesNotExist/);
  expect(await scheduledJobs(t)).toEqual([]);
});

test("scheduling a missing function from an action fails at schedule time", async () => {
  const t = convexTest(schema);
  await expect(
    t.action(scheduleNow(anyApi.scheduler.doesNotExist)),
  ).rejects.toThrow(/no exported function doesNotExist/);
  expect(await scheduledJobs(t)).toEqual([]);
});

test("scheduling through a valid handle still works", async () => {
  const t = convexTest(schema);
  const handle = await t.query(() => createFunctionHandle(api.scheduler.add));
  await t.mutation(scheduleNow(handle, { body: "hi", author: "AI" }));
  expect(await scheduledJobs(t)).toMatchObject([
    { name: "scheduler:add", state: { kind: "pending" } },
  ]);
});
