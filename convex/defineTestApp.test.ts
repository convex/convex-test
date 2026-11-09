import { afterEach, expect, expectTypeOf, test, vi } from "vitest";
import {
  type ApiFromModules,
  type DataModelFromSchemaDefinition,
  type GenericMutationCtx,
  createFunctionHandle,
  defineSchema,
  defineTable,
  getFunctionName,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
import {
  defineTestApp,
  type ComponentRegistration,
  type TestConvex,
} from "../index";
import { components } from "./_generated/api";
import counterTest from "./counter/test";
import type * as counterCallbacks from "./counter/component/callbacks";

const schema = defineSchema({
  events: defineTable({ key: v.string() }).index("key", ["key"]),
});
const app = defineTestApp({ schema });
const callback = vi.fn(
  async (
    ctx: GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>,
    { key, fail }: { key: string; fail?: boolean },
  ) => {
    await ctx.db.insert("events", { key });
    if (fail) throw new Error("callback failed");
    return null;
  },
);

const modules = {
  test: {
    bar: app.mutation({
      args: { key: v.string() },
      returns: v.id("events"),
      handler: async (ctx, args) => await ctx.db.insert("events", args),
    }),
    list: app.query({
      args: { key: v.string() },
      returns: v.array(v.string()),
      handler: async (ctx, { key }) => {
        const events = await ctx.db
          .query("events")
          .withIndex("key", (q) => q.eq("key", key))
          .collect();
        return events.map((event) => event.key);
      },
    }),
    run: app.action({
      args: { key: v.string() },
      returns: v.number(),
      handler: async (ctx, args): Promise<number> => {
        return await ctx.runAction(internal.test.callbacks.run, args);
      },
    }),
    identity: app.query({
      args: {},
      returns: v.union(v.string(), v.null()),
      handler: async (ctx) => (await ctx.auth.getUserIdentity())?.name ?? null,
    }),
  },
  "test/callbacks": {
    complete: app.internalMutation({
      args: { key: v.string(), fail: v.optional(v.boolean()) },
      returns: v.null(),
      handler: callback,
    }),
    count: app.internalQuery({
      args: { key: v.string() },
      returns: v.number(),
      handler: async (ctx, args): Promise<number> => {
        return (await ctx.runQuery(api.test.list, args)).length;
      },
    }),
    run: app.internalAction({
      args: { key: v.string() },
      returns: v.number(),
      handler: async (ctx, args): Promise<number> => {
        await ctx.runMutation(internal.test.callbacks.complete, args);
        return await ctx.runQuery(internal.test.callbacks.count, args);
      },
    }),
    schedule: app.internalMutation({
      args: { key: v.string() },
      returns: v.null(),
      handler: async (ctx, args): Promise<null> => {
        await ctx.scheduler.runAfter(0, internal.test.callbacks.run, args);
        return null;
      },
    }),
  },
};
const { api, internal, createTest } = app.defineModules(modules);

afterEach(() => {
  vi.useRealTimers();
  callback.mockClear();
});

test("defines typed functions without generated modules", async () => {
  const t = createTest();
  expectTypeOf(t).toEqualTypeOf<TestConvex<typeof schema>>();
  const id = await t.mutation(api.test.bar, { key: "hello" });
  const event = await t.run(async (ctx) => await ctx.db.get(id));
  expect(event).toMatchObject({ key: "hello" });
  expectTypeOf(event!.key).toEqualTypeOf<string>();
  expect(await t.query(api.test.list, { key: "hello" })).toEqual(["hello"]);
  expect(getFunctionName(api.test.bar)).toBe("test:bar");
  expect(getFunctionName(internal.test.callbacks.complete)).toBe(
    "test/callbacks:complete",
  );
});

test("public and internal functions can call sibling modules", async () => {
  const t = createTest();
  const result = await t.action(api.test.run, { key: "work" });
  expectTypeOf(result).toEqualTypeOf<number>();
  expect(result).toBe(1);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(await t.query(internal.test.callbacks.count, { key: "work" })).toBe(1);
});

test("preserves argument validation, schema validation, and rollback", async () => {
  const t = createTest();
  await expect(
    t.mutation(internal.test.callbacks.complete, { key: 123 as any }),
  ).rejects.toThrow("Validator error");
  expect(callback).not.toHaveBeenCalled();
  await expect(
    t.run(async (ctx) => await ctx.db.insert("events", { key: 123 as any })),
  ).rejects.toThrow("Validator error");
  await expect(
    t.mutation(internal.test.callbacks.complete, { key: "failed", fail: true }),
  ).rejects.toThrow("callback failed");
  expect(callback).toHaveBeenCalledTimes(1);
  expect(await t.query(api.test.list, { key: "failed" })).toEqual([]);
});

test("preserves return validation", async () => {
  const fixture = app.defineModules({
    invalid: {
      result: app.query({
        args: {},
        returns: v.number(),
        handler: () => "wrong" as any,
      }),
    },
  });
  await expect(
    fixture.createTest().query(fixture.api.invalid.result),
  ).rejects.toThrow("Return value validation failed");
});

test("instances and identities retain their own state", async () => {
  const first = createTest();
  const second = createTest();
  const asAlice = first.withIdentity({ name: "Alice" });
  await asAlice.mutation(api.test.bar, { key: "first" });
  await second.mutation(api.test.bar, { key: "second" });
  expect(await first.query(api.test.list, { key: "first" })).toEqual(["first"]);
  expect(await second.query(api.test.list, { key: "first" })).toEqual([]);
  expect(await first.query(api.test.list, { key: "second" })).toEqual([]);
  expect(await second.query(api.test.list, { key: "second" })).toEqual([
    "second",
  ]);
  expect(await asAlice.query(api.test.identity)).toBe("Alice");
  expect(await first.query(api.test.identity)).toBeNull();
  expect(await second.query(api.test.identity)).toBeNull();
});

test("schedules named functions and their nested calls", async () => {
  vi.useFakeTimers();
  const t = createTest();
  await t.mutation(internal.test.callbacks.schedule, { key: "scheduled" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(await t.query(api.test.list, { key: "scheduled" })).toEqual([
    "scheduled",
  ]);
});

test("accepts a component's default testing helper and custom registration name", async () => {
  const t = createTest();
  counterTest.register(t);
  counterTest.register(t, "counter2");
  await t.action(async (ctx) => {
    await ctx.runMutation(components.counter.public.add, {
      name: "beans",
      count: 3,
    });
    await ctx.runMutation(components.counter2.public.add, {
      name: "beans",
      count: 5,
    });
  });
  expect(
    await t.query(components.counter.public.count, { name: "beans" }),
  ).toBe(3);
  expect(
    await t.query(components.counter2.public.count, { name: "beans" }),
  ).toBe(5);
  await t.mutation(api.test.bar, { key: "application" });
  expect(await t.query(api.test.list, { key: "application" })).toEqual([
    "application",
  ]);

  const other = createTest();
  await expect(
    other.query(components.counter.public.count, { name: "beans" }),
  ).rejects.toThrow('Component "counter" is not registered');
  counterTest.register(other);
  expect(
    await other.query(components.counter.public.count, { name: "beans" }),
  ).toBe(0);
});

test("components invoke application callbacks through function handles", async () => {
  const register: ComponentRegistration<
    ApiFromModules<{ callbacks: typeof counterCallbacks }>
  > = (t, name) => {
    counterTest.register(t, name);
  };
  const componentApp = defineTestApp({
    schema,
    components: {
      counter: { register },
    },
  });
  const t = componentApp.defineModules(modules).createTest();
  const counter = componentApp.components.counter;
  const handle = await t.run(async () => {
    return await createFunctionHandle(internal.test.callbacks.complete);
  });
  await t.mutation(counter.callbacks.invoke, { handle, key: "callback" });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(await t.query(api.test.list, { key: "callback" })).toEqual([
    "callback",
  ]);
  await expect(
    t.mutation(counter.callbacks.invoke, { handle, key: "failed", fail: true }),
  ).rejects.toThrow("callback failed");
  expect(await t.query(api.test.list, { key: "failed" })).toEqual([]);
});

test("supports default exports and excludes ordinary exports from API types", async () => {
  const fixture = app.defineModules({
    example: {
      default: app.query({ args: {}, returns: v.number(), handler: () => 42 }),
      helper: () => "ordinary export",
    },
  });
  expect(await fixture.createTest().query(fixture.api.example.default)).toBe(
    42,
  );
  // @ts-expect-error Ordinary exports are not function references.
  void fixture.api.example.helper;
});

test("empty definitions support inline calls and report missing modules", async () => {
  const t = app.defineModules({}).createTest();
  await t.mutation(async (ctx) => {
    await ctx.db.insert("events", { key: "inline" });
  });
  expect(
    await t.query(
      async (ctx) => (await ctx.db.query("events").collect()).length,
    ),
  ).toBe(1);
  await expect(
    t.query(makeFunctionReference<"query">("missing:query")),
  ).rejects.toThrow('Could not find module for: "missing"');
});

test("forwards transaction limit options to the normal test runtime", async () => {
  const t = createTest({ transactionLimits: { documentsWritten: 0 } });
  await expect(t.mutation(api.test.bar, { key: "limited" })).rejects.toThrow(
    "Wrote too many documents",
  );
  expect(await t.query(api.test.list, { key: "limited" })).toEqual([]);
});

test("rejects incorrect function references and schema usage at compile time", () => {
  // This function is typechecked but deliberately never executed.
  const checkTypes = async () => {
    const t = createTest();
    // @ts-expect-error Arguments are inferred from validators.
    await t.mutation(api.test.bar, { key: 123 });
    // @ts-expect-error Required arguments cannot be omitted.
    await t.mutation(api.test.bar);
    // @ts-expect-error Mutations cannot be called as queries.
    await t.query(api.test.bar, { key: "wrong kind" });
    // @ts-expect-error Internal functions are excluded from the public API.
    void api.test.callbacks.complete;
    // @ts-expect-error Public functions are excluded from the internal API.
    void internal.test.bar;
    // @ts-expect-error Unknown function names are rejected.
    void api.test.missing;
    // @ts-expect-error Function return types are preserved.
    const wrong: string = await t.action(api.test.run, { key: "wrong return" });
    void wrong;

    app.mutation({
      args: {},
      returns: v.null(),
      handler: async (ctx) => {
        // @ts-expect-error Schema rejects unknown tables.
        await ctx.db.insert("unknown", { key: "hello" });
        // @ts-expect-error Schema rejects incorrect field types.
        await ctx.db.insert("events", { key: 123 });
        // @ts-expect-error Schema rejects unknown indexes.
        await ctx.db.query("events").withIndex("missing").collect();
        return null;
      },
    });
    app.query({
      args: {},
      returns: v.null(),
      handler: async (ctx) => {
        // @ts-expect-error Query contexts cannot write.
        await ctx.db.insert("events", { key: "hello" });
        return null;
      },
    });
  };
  void checkTypes;
});
