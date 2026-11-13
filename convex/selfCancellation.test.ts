import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { anyApi, componentsGeneric } from "convex/server";
import { v, type GenericId } from "convex/values";
import { defineTestApp } from "../index";
import schema from "./schema";

const runtime = vi.hoisted(() => ({ version: "1.50.0" }));
vi.mock("convex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex")>()),
  get version() {
    return runtime.version;
  },
}));

const app = defineTestApp({ schema });
const modules = {
  selfCancel: {
    cancel: app.internalMutation({
      args: { id: v.id("_scheduled_functions") },
      returns: v.null(),
      handler: async (ctx, { id }) => {
        await ctx.scheduler.cancel(id);
        return null;
      },
    }),
    run: app.internalMutation({
      args: {
        caught: v.boolean(),
        nested: v.boolean(),
        component: v.optional(v.boolean()),
      },
      returns: v.null(),
      handler: async (ctx, { caught, nested, component }) => {
        await ctx.db.insert("messages", {
          author: "test",
          body: "before cancel",
        });
        await ctx.scheduler.runAfter(60_000, anyApi.selfCancel.cancel, {
          id: (await ctx.meta.getRequestMetadata()).scheduledFunctionId!,
        });
        const id = (await ctx.meta.getRequestMetadata()).scheduledFunctionId!;
        try {
          if (component) {
            await ctx.runMutation(componentsGeneric().child.selfCancel.cancel, {
              id,
            });
          } else if (nested) {
            await ctx.runMutation(anyApi.selfCancel.cancel, { id });
          } else {
            await ctx.scheduler.cancel(id as GenericId<"_scheduled_functions">);
          }
        } catch (error) {
          if (!caught) throw error;
          await ctx.db.insert("messages", {
            author: "test",
            body: (error as Error).message,
          });
        }
        return null;
      },
    }),
    action: app.internalAction({
      args: { nested: v.optional(v.boolean()) },
      returns: v.null(),
      handler: async (ctx, { nested }) => {
        const id = (await ctx.meta.getRequestMetadata()).scheduledFunctionId!;
        if (nested) {
          await ctx.runMutation(anyApi.selfCancel.cancel, { id });
        } else {
          await ctx.scheduler.cancel(id as GenericId<"_scheduled_functions">);
        }
        return null;
      },
    }),
  },
};
const fixture = app.defineModules(modules);

beforeEach(() => {
  runtime.version = "1.50.0";
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function runSelfCancel(
  caught = false,
  nested = false,
  component = false,
) {
  const t = fixture.createTest();
  t.registerComponent("child", schema, {
    "./_generated/server.ts": async () => ({}),
    "./selfCancel.ts": async () => modules.selfCancel,
  });
  const id = await t.mutation(async (ctx) =>
    ctx.scheduler.runAfter(0, fixture.internal.selfCancel.run, {
      caught,
      nested,
      component,
    }),
  );
  vi.runAllTimers();
  await t.finishInProgressScheduledFunctions();
  const job = await t.query(async (ctx) => ctx.db.system.get(id));
  const messages = await t.query(async (ctx) =>
    ctx.db.query("messages").take(10),
  );
  return { t, job, messages };
}

test.each([false, true])(
  "uncaught self-cancel rolls back (nested=%s)",
  async (nested) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { t, job, messages } = await runSelfCancel(false, nested);
    expect(job?.state.kind).toBe("failed");
    expect(messages).toEqual([]);
    expect(
      await t.query(async (ctx) =>
        ctx.db.system.query("_scheduled_functions").take(10),
      ),
    ).toHaveLength(1);
    expect(errors).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        message: expect.stringContaining("ScheduledFunctionCancelingItself"),
      }),
    );
  },
);

test.each([false, true])(
  "caught self-cancel can commit (nested=%s)",
  async (nested) => {
    const { job, messages } = await runSelfCancel(true, nested);
    expect(job?.state.kind).toBe("success");
    expect(messages.map((m) => m.body)).toEqual([
      "before cancel",
      "ScheduledFunctionCancelingItself: A mutation cannot cancel itself",
    ]);
  },
);

test.each(["1.43.0", "1.49.0"])(
  "%s warns and ignores self-cancellation",
  async (version) => {
    runtime.version = version;
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { job, messages } = await runSelfCancel();
    expect(job?.state.kind).toBe("success");
    expect(messages).toHaveLength(1);
    expect(warnings).toHaveBeenCalledWith(
      expect.stringContaining("deprecated"),
    );
  },
);

test.each(["1.50.0", "1.50.1", "1.51.0", "2.0.0", "2.1.0"])(
  "%s rejects self-cancellation",
  async (version) => {
    runtime.version = version;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await runSelfCancel()).job?.state.kind).toBe("failed");
  },
);

test("scheduled actions can cancel themselves", async () => {
  const t = fixture.createTest();
  const id = await t.mutation(async (ctx) =>
    ctx.scheduler.runAfter(0, fixture.internal.selfCancel.action, {}),
  );
  vi.runAllTimers();
  await t.finishInProgressScheduledFunctions();
  expect(
    (await t.query(async (ctx) => ctx.db.system.get(id)))?.state.kind,
  ).toBe("canceled");
});

test("a child component cannot cancel its parent scheduled mutation", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { job, messages } = await runSelfCancel(false, false, true);
  expect(job?.state.kind).toBe("failed");
  expect(messages).toEqual([]);
});

test.each([
  { version: "1.49.0", state: "success" },
  { version: "1.50.0", state: "failed" },
])(
  "a mutation called by a scheduled action follows $version cancellation behavior",
  async ({ version, state }) => {
    runtime.version = version;
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = fixture.createTest();
    const id = await t.mutation(async (ctx) =>
      ctx.scheduler.runAfter(0, fixture.internal.selfCancel.action, {
        nested: true,
      }),
    );
    vi.runAllTimers();
    await t.finishInProgressScheduledFunctions();
    expect(
      (await t.query(async (ctx) => ctx.db.system.get(id)))?.state.kind,
    ).toBe(state);
    if (state === "success") {
      expect(warnings).toHaveBeenCalledWith(
        expect.stringContaining("deprecated"),
      );
      expect(errors).not.toHaveBeenCalled();
    } else {
      expect(errors).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.stringContaining("ScheduledFunctionCancelingItself"),
        }),
      );
      expect(warnings).not.toHaveBeenCalled();
    }
  },
);
