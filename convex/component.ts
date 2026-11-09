import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { components } from "./_generated/api";
import { createFunctionHandle } from "convex/server";
import { v } from "convex/values";

export const directCall = internalAction({
  args: {},
  handler: async (ctx, _args) => {
    await ctx.runMutation(components.counter.public.add, {
      name: "pennies",
      count: 250,
    });
    await ctx.runMutation(components.counter.public.add, {
      name: "beans",
      count: 3,
      shards: 100,
    });
    await ctx.runAction(components.counter.public.countMany, {
      names: ["beans", "pennies"],
    });
    const count = await ctx.runQuery(components.counter.public.count, {
      name: "beans",
    });
    return count;
  },
});

export const mutationWithNestedQuery = internalMutation({
  args: {},
  handler: async (ctx, _args): Promise<number> => {
    return await ctx.runMutation(
      components.counter.public.mutationWithNestedQuery,
    );
  },
});

export const directCall2 = internalQuery({
  args: {},
  handler: async (ctx, _args) => {
    const count = await ctx.runQuery(components.counter.public.count, {
      name: "beans",
    });
    return count;
  },
});

export const schedule = internalMutation({
  args: {},
  handler: async (ctx, _args) => {
    await ctx.runMutation(components.counter.public.schedule, {
      name: "beans",
    });
  },
});

// Note this must be a mutation because `createFunctionHandle` writes to the
// database, and we need to commit it.
// In a real Convex app, the function handle is automatically created on push,
// so it does work in queries.
export const getFunctionHandle = internalQuery({
  args: {},
  returns: v.string(),
  handler: async () => {
    const handle = await createFunctionHandle(components.counter.public.add);
    return handle;
  },
});

export const callHandle = internalMutation({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, { handle }) => {
    await ctx.runMutation(
      handle as any as typeof components.counter.public.add,
      { name: "beans", count: 3 },
    );
  },
});

export const scheduleHandle = internalMutation({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    await ctx.scheduler.runAfter(
      1000,
      handle as any as typeof components.counter.public.add,
      { name: "beans", count: 3 },
    );
  },
});

export const scheduleOnBothComponents = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    await Promise.all([
      ctx.runMutation(components.counter.public.schedule, { name: "beans" }),
      ctx.runMutation(components.counter2.public.schedule, { name: "beans" }),
    ]);
    return null;
  },
});

export const parallelComponentQueries = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ count1: number; count2: number }> => {
    const [count1, count2] = await Promise.all([
      ctx.runQuery(components.counter.public.count, { name: "beans" }),
      ctx.runQuery(components.counter2.public.count, { name: "beans" }),
    ]);
    return { count1, count2 };
  },
});

export const actionOnCounter1 = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    await ctx.runMutation(components.counter.public.add, {
      name: "beans",
      count: 10,
    });
    return await ctx.runQuery(components.counter.public.count, {
      name: "beans",
    });
  },
});

export const actionOnCounter2 = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    await ctx.runMutation(components.counter2.public.add, {
      name: "beans",
      count: 20,
    });
    return await ctx.runQuery(components.counter2.public.count, {
      name: "beans",
    });
  },
});

export const queryComponentAuth = internalQuery({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    return await ctx.runQuery(components.counter.public.getIdentityName);
  },
});

export const mutationComponentAuth = internalMutation({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    return await ctx.runQuery(components.counter.public.getIdentityName);
  },
});

export const actionComponentAuth = internalAction({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    return await ctx.runQuery(components.counter.public.getIdentityName);
  },
});

export const actionCallingComponentAction = internalAction({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    return await ctx.runAction(components.counter.public.getIdentityNameAction);
  },
});

export const actionSchedulingOnBothComponents = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    // Schedule mutations on both components from an action.
    // Each component's `schedule` mutation uses ctx.scheduler.runAfter,
    // so this exercises setTimeout within an action across components.
    await Promise.all([
      ctx.runMutation(components.counter.public.schedule, { name: "beans" }),
      ctx.runMutation(components.counter2.public.schedule, { name: "beans" }),
    ]);
    return null;
  },
});

export const parallelComponentMutations = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    await Promise.all([
      ctx.runMutation(components.counter.public.add, {
        name: "beans",
        count: 1,
      }),
      ctx.runMutation(components.counter2.public.add, {
        name: "beans",
        count: 1,
      }),
    ]);
    return null;
  },
});

export const parallelSequentialComponentActions = internalAction({
  args: {},
  handler: async (ctx) => {
    const [[count1a, count1b], [count2a, count2b]] = await Promise.all([
      (async () => {
        const a = await ctx.runAction(components.counter.public.countAction, {
          name: "a",
        });
        const b = await ctx.runAction(components.counter.public.countAction, {
          name: "b",
        });
        return [a, b] as const;
      })(),
      (async () => {
        const a = await ctx.runAction(components.counter2.public.countAction, {
          name: "a",
        });
        const b = await ctx.runAction(components.counter2.public.countAction, {
          name: "b",
        });
        return [a, b] as const;
      })(),
    ]);
    return { count1a, count1b, count2a, count2b };
  },
});

export const parallelSequentialComponentQueries = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [[count1a, count1b], [count2a, count2b]] = await Promise.all([
      (async () => {
        const a = await ctx.runQuery(components.counter.public.count, {
          name: "a",
        });
        const b = await ctx.runQuery(components.counter.public.count, {
          name: "b",
        });
        return [a, b] as const;
      })(),
      (async () => {
        const a = await ctx.runQuery(components.counter2.public.count, {
          name: "a",
        });
        const b = await ctx.runQuery(components.counter2.public.count, {
          name: "b",
        });
        return [a, b] as const;
      })(),
    ]);
    return { count1a, count1b, count2a, count2b };
  },
});

// Writes in both the app and the component within one transaction, so both rows
// must land on the same commit timestamp.
export const writeCommitTsAcrossComponents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.db.insert("commitTs", {
      commitTs: ctx.db.vars.commitTs,
    });
    await ctx.runMutation(components.counter.public.addWithCommitTs, {
      name: "commitTs",
    });
    return id;
  },
});

export const paginateInComponent = internalQuery({
  args: {},
  handler: async (ctx, _args) => {
    return await ctx.runQuery(components.counter.public.paginate, {
      paginationOpts: { numItems: 10, cursor: null },
    });
  },
});
