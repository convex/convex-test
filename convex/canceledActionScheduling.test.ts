import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  anyApi,
  componentsGeneric,
  type DocumentByName,
  type SystemDataModel,
} from "convex/server";
import { v, type GenericId } from "convex/values";
import { defineTestApp } from "../index";
import schema from "./schema";

const pause = vi.fn(async () => {});
const app = defineTestApp({ schema });
const modules = {
  probe: {
    child: app.internalMutation({
      args: { label: v.string() },
      returns: v.null(),
      handler: async (ctx, { label }) => {
        await ctx.db.insert("messages", { author: "child", body: label });
        return null;
      },
    }),
    schedule: app.internalMutation({
      args: { label: v.string() },
      returns: v.id("_scheduled_functions"),
      handler: async (
        ctx,
        { label },
      ): Promise<GenericId<"_scheduled_functions">> =>
        await ctx.scheduler.runAfter(60_000, anyApi.probe.child, { label }),
    }),
    scheduleAction: app.internalAction({
      args: { label: v.string() },
      returns: v.id("_scheduled_functions"),
      handler: async (
        ctx,
        { label },
      ): Promise<GenericId<"_scheduled_functions">> =>
        await ctx.scheduler.runAt(Date.now() + 60_000, anyApi.probe.child, {
          label,
        }),
    }),
    jobs: app.internalQuery({
      args: {},
      returns: v.any(),
      handler: async (ctx) =>
        await ctx.db.system.query("_scheduled_functions").take(20),
    }),
    run: app.internalAction({
      args: {
        selfCancel: v.boolean(),
        wait: v.boolean(),
        component: v.boolean(),
      },
      returns: v.null(),
      handler: async (ctx, { selfCancel, wait, component }) => {
        await ctx.scheduler.runAfter(60_000, anyApi.probe.child, {
          label: "before",
        });
        if (wait) await pause();
        const metadata = await ctx.meta.getRequestMetadata();
        expect(Object.keys(metadata).sort()).toEqual([
          "authToken",
          "ip",
          "requestId",
          "scheduledFunctionId",
          "userAgent",
        ]);
        if (selfCancel) {
          await ctx.scheduler.cancel(
            metadata.scheduledFunctionId! as GenericId<"_scheduled_functions">,
          );
        }
        await ctx.scheduler.runAfter(60_000, anyApi.probe.child, {
          label: "after",
        });
        await ctx.scheduler.runAt(Date.now() + 60_000, anyApi.probe.child, {
          label: "at",
        });
        await ctx.runMutation(anyApi.probe.schedule, {
          label: "nested-mutation",
        });
        await ctx.runAction(anyApi.probe.scheduleAction, {
          label: "nested-action",
        });
        if (component) {
          await ctx.runMutation(componentsGeneric().child.probe.schedule, {
            label: "component",
          });
        }
        return null;
      },
    }),
  },
};
const fixture = app.defineModules(modules);
const childModules = {
  "./_generated/server.ts": async () => ({}),
  "./probe.ts": async () => modules.probe,
};

beforeEach(() => {
  vi.useFakeTimers();
  pause.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

async function start(
  t: ReturnType<typeof fixture.createTest>,
  options = { selfCancel: true, wait: false, component: false },
) {
  const id = await t.mutation(async (ctx) =>
    ctx.scheduler.runAfter(0, fixture.internal.probe.run, options),
  );
  vi.advanceTimersToNextTimer();
  return id;
}

function expectChildrenCanceled(
  jobs: DocumentByName<SystemDataModel, "_scheduled_functions">[],
) {
  const children = jobs.filter((job) => job.name === "probe:child");
  expect(
    children.map((job) => ({ label: job.args[0], state: job.state.kind })),
  ).toEqual([
    { label: { label: "before" }, state: "pending" },
    { label: { label: "after" }, state: "canceled" },
    { label: { label: "at" }, state: "canceled" },
    { label: { label: "nested-mutation" }, state: "canceled" },
    { label: { label: "nested-action" }, state: "canceled" },
  ]);
  for (const job of children.filter((job) => job.state.kind === "canceled")) {
    expect(job.completedTime).toEqual(expect.any(Number));
    expect(job.scheduledTime).toBe(job.completedTime);
  }
}

test("self-canceled actions create canceled jobs without timers", async () => {
  const t = fixture.createTest();
  await start(t);
  await t.finishInProgressScheduledFunctions();
  expectChildrenCanceled(await t.query(fixture.internal.probe.jobs));
  // Only the job scheduled before cancellation needs a timer.
  expect(vi.getTimerCount()).toBe(1);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await t.query(async (ctx) => ctx.db.query("messages").take(10)),
  ).toMatchObject([{ body: "before" }]);
});

test("external cancellation is observed when the action resumes", async () => {
  let resume!: () => void;
  let notifyPaused!: () => void;
  const paused = new Promise<void>((resolve) => {
    notifyPaused = resolve;
  });
  const resumed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  pause.mockImplementation(async () => {
    notifyPaused();
    await resumed;
  });
  const t = fixture.createTest();
  const id = await start(t, {
    selfCancel: false,
    wait: true,
    component: false,
  });
  await paused;
  await t.mutation(async (ctx) => {
    await ctx.scheduler.cancel(id);
  });
  resume();
  await t.finishInProgressScheduledFunctions();
  expectChildrenCanceled(await t.query(fixture.internal.probe.jobs));
  expect(vi.getTimerCount()).toBe(1);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await t.query(async (ctx) => ctx.db.query("messages").take(10)),
  ).toMatchObject([{ body: "before" }]);
});

test("uncanceled scheduled actions and ordinary actions can schedule normally", async () => {
  const t = fixture.createTest();
  await start(t, { selfCancel: false, wait: false, component: false });
  await t.finishInProgressScheduledFunctions();
  await t.action(fixture.internal.probe.scheduleAction, { label: "ordinary" });
  const jobs = await t.query(fixture.internal.probe.jobs);
  expect(
    jobs
      .filter((job: { name: string }) => job.name === "probe:child")
      .every(
        (job: { state: { kind: string } }) => job.state.kind === "pending",
      ),
  ).toBe(true);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await t.query(async (ctx) => ctx.db.query("messages").take(10)),
  ).toHaveLength(6);
});

test("component scheduling checks the owning database even when IDs collide", async () => {
  const t = fixture.createTest();
  t.registerComponent("child", schema, childModules);
  const unrelated = await t.action(
    async (ctx) =>
      await ctx.runMutation(componentsGeneric().child.probe.schedule, {
        label: "unrelated",
      }),
  );
  const parent = await start(t, {
    selfCancel: true,
    wait: false,
    component: true,
  });
  expect(parent).toBe(unrelated);
  await t.finishInProgressScheduledFunctions();
  expectChildrenCanceled(await t.query(fixture.internal.probe.jobs));
  const componentJobs = await t.action(
    async (ctx) => await ctx.runQuery(componentsGeneric().child.probe.jobs, {}),
  );
  expect(
    componentJobs.map((job: { state: { kind: string } }) => job.state.kind),
  ).toEqual(["pending", "canceled"]);
  expect(vi.getTimerCount()).toBe(2);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
