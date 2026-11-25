import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { anyApi, defineSchema, defineTable } from "convex/server";
import { v, type GenericId } from "convex/values";
import { defineTestApp } from "../index";

const schema = defineSchema({
  log: defineTable({ label: v.string() }),
});
const app = defineTestApp({ schema });
const fixture = app.defineModules({
  jobs: {
    ok: app.internalMutation({
      args: {},
      returns: v.null(),
      handler: async (ctx) => {
        await ctx.db.insert("log", { label: "ok ran" });
        return null;
      },
    }),
    fail: app.internalMutation({
      args: {},
      returns: v.null(),
      handler: async () => {
        throw new Error("scheduled failure");
      },
    }),
    failAction: app.internalAction({
      args: {},
      returns: v.null(),
      handler: async () => {
        throw new Error("action failure");
      },
    }),
    cancelSelfThenThrow: app.internalAction({
      args: {},
      returns: v.null(),
      handler: async (ctx) => {
        const { scheduledFunctionId } = await ctx.meta.getRequestMetadata();
        await ctx.scheduler.cancel(
          scheduledFunctionId as GenericId<"_scheduled_functions">,
        );
        throw new Error("thrown after cancellation");
      },
    }),
    count: app.internalQuery({
      args: {},
      returns: v.number(),
      handler: async (ctx) => (await ctx.db.query("log").collect()).length,
    }),
    cancelSelfThenSchedule: app.internalAction({
      args: {},
      returns: v.null(),
      handler: async (ctx) => {
        const { scheduledFunctionId } = await ctx.meta.getRequestMetadata();
        await ctx.scheduler.cancel(
          scheduledFunctionId as GenericId<"_scheduled_functions">,
        );
        await ctx.scheduler.runAfter(0, anyApi.jobs.ok, {});
        return null;
      },
    }),
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function runJob(fn: any) {
  const t = fixture.createTest();
  const id = await t.mutation(async (ctx) => {
    return await ctx.scheduler.runAfter(0, fn, {});
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const jobs = await t.query(async (ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return { t, id, jobs, job: jobs.find((job) => job._id === id)! };
}

test("scheduler: a failed job records its error in state.error", async () => {
  const { job } = await runJob(anyApi.jobs.fail);

  expect(job.state).toEqual({
    kind: "failed",
    error: expect.stringContaining("scheduled failure"),
  });
});

test("scheduler: a failed action records its error in state.error", async () => {
  const { job } = await runJob(anyApi.jobs.failAction);
  expect(job.state).toEqual({
    kind: "failed",
    error: expect.stringContaining("action failure"),
  });
});

test("scheduler: a successful job has a completedTime", async () => {
  const { job } = await runJob(anyApi.jobs.ok);

  expect(job.state).toEqual({ kind: "success" });
  expect(job.completedTime).toEqual(expect.any(Number));
});

test("scheduler: a job's name is the canonical module path with .js", async () => {
  const { job } = await runJob(anyApi.jobs.ok);

  expect(job.name).toBe("jobs.js:ok");
});

test("scheduler: runAt rejects an invalid Date", async () => {
  const t = fixture.createTest();
  await expect(
    t.mutation(async (ctx) => {
      await ctx.scheduler.runAt(new Date("not a date"), anyApi.jobs.ok, {});
    }),
  ).rejects.toThrow(/Invalid arguments for `scheduler`|invalid type: null/);
});

test("scheduler: runAt rejects times more than 5 years away", async () => {
  const t = fixture.createTest();
  const sixYears = 6 * 366 * 24 * 60 * 60 * 1000;
  await expect(
    t.mutation(async (ctx) => {
      await ctx.scheduler.runAt(Date.now() + sixYears, anyApi.jobs.ok, {});
    }),
  ).rejects.toThrow(/more than 5 years in the future/);
});

test("scheduler: a scheduled query fails instead of running", async () => {
  const { job } = await runJob(anyApi.jobs.count);

  expect(job.state.kind).toBe("failed");
});
