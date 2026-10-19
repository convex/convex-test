/// <reference types="vite/client" />

import { expect, test, vi } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { components, internal } from "./_generated/api";
import counterSchema from "./counter/component/schema";
import type { QueryCtx } from "./_generated/server";

const counterModules = import.meta.glob("./counter/component/**/*.ts");

function testWithCounter() {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  return t;
}

test("direct call", async () => {
  const t = testWithCounter();
  await t.mutation(components.counter.public.add, {
    name: "beans",
    count: 3,
  });
  const count = await t.query(components.counter.public.count, {
    name: "beans",
  });
  expect(count).toEqual(3);
  const counts = await t.action(components.counter.public.countMany, {
    names: ["beans", "pennies"],
  });
  expect(counts).toEqual([3, 0]);
});

test("generated attributes", async () => {
  const t = testWithCounter();
  const x = await t.action(internal.component.directCall);
  // const x = await t.query(internal.components.directCall2);
  expect(x).toEqual(3);
});

test("component scheduler", async () => {
  vi.useFakeTimers();
  const t = testWithCounter();
  await t.mutation(internal.component.schedule);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

test("function handle", async () => {
  const t = testWithCounter();
  const handle = await t.query(internal.component.getFunctionHandle);
  await t.mutation(internal.component.callHandle, { handle });
  const x = await t.query(internal.component.directCall2);
  expect(x).toEqual(3);
});

test("function handle scheduler", async () => {
  vi.useFakeTimers();
  const t = testWithCounter();
  const handle = await t.query(internal.component.getFunctionHandle);
  await t.mutation(internal.component.scheduleHandle, { handle });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const x = await t.query(internal.component.directCall2);
  expect(x).toEqual(3);
  vi.useRealTimers();
});

test("component nested query", async () => {
  const t = testWithCounter();
  const x = await t.mutation(internal.component.mutationWithNestedQuery);
  expect(x).toEqual(3);
});

function testWithTwoCounters() {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  t.registerComponent("counter2", counterSchema, counterModules);
  return t;
}

test("parallel queries on different components", async () => {
  const t = testWithTwoCounters();
  await Promise.all([
    t.mutation(components.counter.public.add, {
      name: "beans",
      count: 3,
    }),
    t.mutation(components.counter2.public.add, {
      name: "beans",
      count: 5,
    }),
  ]);
  const result = await t.mutation(internal.component.parallelComponentQueries);
  expect(result).toMatchObject({ count1: 3, count2: 5 });
});

test("scheduled mutations on components don't conflict with nested locks", async () => {
  vi.useFakeTimers();
  const t = testWithTwoCounters();
  // Schedule mutations on both components in parallel (nested sub-transactions)
  await t.mutation(internal.component.scheduleOnBothComponents);
  // Run all scheduled functions - these execute as top-level transactions
  // and should not deadlock with the nested lock system
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  // Verify both scheduled mutations completed
  const [count1, count2] = await Promise.all([
    t.query(components.counter.public.count, { name: "beans" }),
    t.query(components.counter2.public.count, { name: "beans" }),
  ]);
  expect(count1).toEqual(1);
  expect(count2).toEqual(1);
  vi.useRealTimers();
});

test("parallel actions on different components don't corrupt function stacks", async () => {
  const t = testWithTwoCounters();
  // Run two actions in parallel, each operating on a different component.
  // Without per-action function stacks, the shared stack would get corrupted.
  const [count1, count2] = await Promise.all([
    t.action(internal.component.actionOnCounter1),
    t.action(internal.component.actionOnCounter2),
  ]);
  expect(count1).toEqual(10);
  expect(count2).toEqual(20);
});

test("auth does not propagate across component boundaries from query", async () => {
  const t = testWithCounter();
  const asSarah = t.withIdentity({ name: "Sarah" });
  const name = await asSarah.query(internal.component.queryComponentAuth);
  expect(name).toBeNull();
});

test("auth does not propagate across component boundaries from mutation", async () => {
  const t = testWithCounter();
  const asSarah = t.withIdentity({ name: "Sarah" });
  const name = await asSarah.mutation(internal.component.mutationComponentAuth);
  expect(name).toBeNull();
});

test("auth does not propagate across component boundaries from action", async () => {
  const t = testWithCounter();
  const asSarah = t.withIdentity({ name: "Sarah" });
  const name = await asSarah.action(internal.component.actionComponentAuth);
  expect(name).toBeNull();
});

test("auth does not propagate across component boundaries from action to action", async () => {
  const t = testWithCounter();
  const asSarah = t.withIdentity({ name: "Sarah" });
  const name = await asSarah.action(
    internal.component.actionCallingComponentAction,
  );
  expect(name).toBeNull();
});

test("auth applies to directly called component function", async () => {
  const t = testWithCounter();
  const asSarah = t.withIdentity({ name: "Sarah" });
  const name = await asSarah.query(components.counter.public.getIdentityName);
  expect(name).toEqual("Sarah");
});

test("parallel actions scheduling across components via setTimeout", async () => {
  vi.useFakeTimers();
  const t = testWithTwoCounters();
  // Run two actions in parallel: one on counter1, one on counter2.
  // Meanwhile, a third action schedules mutations on both components
  // (each component's `schedule` uses ctx.scheduler.runAfter, i.e. setTimeout).
  const [count1, count2] = await Promise.all([
    t.action(internal.component.actionOnCounter1),
    t.action(internal.component.actionOnCounter2),
    t.action(internal.component.actionSchedulingOnBothComponents),
  ]);
  expect(count1).toEqual(10);
  expect(count2).toEqual(20);
  // Now let the scheduled functions fire and complete.
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  // Each component got +1 from the scheduled add.
  const finalCount1 = await t.query(components.counter.public.count, {
    name: "beans",
  });
  const finalCount2 = await t.query(components.counter2.public.count, {
    name: "beans",
  });
  expect(finalCount1).toEqual(11);
  expect(finalCount2).toEqual(21);
  vi.useRealTimers();
});

test("separate convexTest instances are isolated with scheduling", async () => {
  vi.useFakeTimers();
  // Two completely independent test instances running in parallel.
  // Each schedules mutations on its own components via setTimeout.
  // They must not interfere with each other.
  const t1 = testWithTwoCounters();
  const t2 = testWithTwoCounters();

  // Seed different data in each instance.
  await Promise.all([
    t1.mutation(components.counter.public.add, {
      name: "beans",
      count: 100,
    }),
    t2.mutation(components.counter.public.add, {
      name: "beans",
      count: 200,
    }),
  ]);

  // Run actions that schedule via setTimeout on both instances in parallel.
  await Promise.all([
    t1.action(internal.component.actionSchedulingOnBothComponents),
    t2.action(internal.component.actionSchedulingOnBothComponents),
  ]);

  // Let both instances' scheduled functions fire.
  await Promise.all([
    t1.finishAllScheduledFunctions(vi.runAllTimers),
    t2.finishAllScheduledFunctions(vi.runAllTimers),
  ]);

  // Each instance's counter should reflect only its own data.
  const count1 = await t1.query(components.counter.public.count, {
    name: "beans",
  });
  const count2 = await t2.query(components.counter.public.count, {
    name: "beans",
  });
  // t1: 100 (seeded) + 1 (scheduled) = 101
  expect(count1).toEqual(101);
  // t2: 200 (seeded) + 1 (scheduled) = 201
  expect(count2).toEqual(201);
  vi.useRealTimers();
});

test("parallel sequential cross-component queries (issue #80)", async () => {
  const t = testWithTwoCounters();
  const result = await t.query(
    internal.component.parallelSequentialComponentQueries,
  );
  expect(result).toMatchObject({
    count1a: 0,
    count1b: 0,
    count2a: 0,
    count2b: 0,
  });
});

test("parallel sequential cross-component actions", async () => {
  const t = testWithTwoCounters();
  const result = await t.action(
    internal.component.parallelSequentialComponentActions,
  );
  expect(result).toMatchObject({
    count1a: 0,
    count1b: 0,
    count2a: 0,
    count2b: 0,
  });
});

test("parallel mutations on different components", async () => {
  const t = testWithTwoCounters();
  await t.mutation(internal.component.parallelComponentMutations);
  const [count1, count2] = await Promise.all([
    t.query(components.counter.public.count, {
      name: "beans",
    }),
    t.query(components.counter2.public.count, {
      name: "beans",
    }),
  ]);
  expect(count1).toEqual(1);
  expect(count2).toEqual(1);
});

test("components can paginate directly and from an app query", async () => {
  const t = testWithCounter();
  await t.mutation(components.counter.public.add, { name: "beans", count: 3 });
  const direct = await t.query(components.counter.public.paginate, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(direct.page).toMatchObject([{ name: "beans", value: 3 }]);
  expect(direct.isDone).toBe(true);
  const nested = await t.query(internal.component.paginateInComponent);
  expect(nested).toEqual(direct);
});

test.each(["query", "mutation", "run"] as const)(
  "app and component pagination in a %s",
  async (udfType) => {
    const t = testWithCounter();
    for (const componentFirst of [false, true]) {
      const handler = async (ctx: QueryCtx) => {
        const app = () =>
          ctx.db.query("messages").paginate({ numItems: 10, cursor: null });
        const component = () =>
          ctx.runQuery(components.counter.public.paginate, {
            paginationOpts: { numItems: 10, cursor: null },
          });
        await (componentFirst ? component() : app());
        await (componentFirst ? app() : component());
      };
      if (udfType === "query") {
        await expect(t.query(handler)).rejects.toThrow(
          /single paginated query.*per query/,
        );
      } else {
        await expect(
          udfType === "mutation" ? t.mutation(handler) : t.run(handler),
        ).resolves.toBeNull();
      }
    }
  },
);

test.each(["query", "mutation"] as const)(
  "pagination in different components called from a %s",
  async (udfType) => {
    const t = testWithTwoCounters();
    const handler = async (ctx: QueryCtx) => {
      await ctx.runQuery(components.counter.public.paginate, {
        paginationOpts: { numItems: 10, cursor: null },
      });
      await ctx.runQuery(components.counter2.public.paginate, {
        paginationOpts: { numItems: 10, cursor: null },
      });
    };
    if (udfType === "query") {
      await expect(t.query(handler)).rejects.toThrow(
        /single paginated query.*per query/,
      );
    } else {
      await expect(t.mutation(handler)).resolves.toBeNull();
    }
  },
);
