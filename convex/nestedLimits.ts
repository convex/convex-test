import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation, query } from "./_generated/server";

const transactionLimitsValidator = v.object({
  bytesRead: v.optional(v.number()),
  bytesWritten: v.optional(v.number()),
  databaseQueries: v.optional(v.number()),
  documentsRead: v.optional(v.number()),
  documentsWritten: v.optional(v.number()),
  functionsScheduled: v.optional(v.number()),
  scheduledFunctionArgsBytes: v.optional(v.number()),
});

// Child query that reads every message.
export const readAll = query(async (ctx) => {
  const docs = await ctx.db.query("messages").collect();
  return docs.length;
});

// Child query that reads exactly `n` messages.
export const readN = query({
  args: { n: v.number() },
  handler: async (ctx, { n }) => {
    const docs = await ctx.db.query("messages").take(n);
    return docs.length;
  },
});

// Child mutation that inserts `count` messages.
export const insertMany = mutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("messages", { author: "child", body: `msg${i}` });
    }
  },
});

// Child mutation that inserts `count` messages and then throws, so all of its
// writes are rolled back.
export const insertManyThenThrow = mutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("messages", { author: "child", body: `msg${i}` });
    }
    throw new Error("nested boom");
  },
});

// Parent mutation that calls a nested mutation which rolls back, swallows the
// error, then reports the transaction metrics. Used to verify the rolled-back
// nested writes are not counted against the transaction.
export const insertRollbackThenReportMetrics = mutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    try {
      await ctx.runMutation(api.nestedLimits.insertManyThenThrow, { count });
    } catch {
      // Swallow: the nested mutation's writes have been rolled back.
    }
    const metrics = await ctx.meta.getTransactionMetrics();
    return metrics.documentsWritten.used;
  },
});

// Parent mutation that runs a nested mutation which rolls back, then inserts
// `keptCount` messages of its own. Used to verify rolled-back nested writes
// don't consume the global write limit.
export const parentInsertAfterRollback = mutation({
  args: { rolledBackCount: v.number(), keptCount: v.number() },
  handler: async (ctx, { rolledBackCount, keptCount }) => {
    try {
      await ctx.runMutation(api.nestedLimits.insertManyThenThrow, {
        count: rolledBackCount,
      });
    } catch {
      // Swallow: the nested mutation's writes have been rolled back.
    }
    for (let i = 0; i < keptCount; i++) {
      await ctx.db.insert("messages", { author: "parent", body: `kept${i}` });
    }
  },
});

// Parent query that calls a nested query with custom transaction limits.
export const parentReadWithLimits = query({
  args: { transactionLimits: transactionLimitsValidator },
  handler: async (ctx, { transactionLimits }): Promise<number> => {
    return await ctx.runQuery(
      api.nestedLimits.readAll,
      {},
      { transactionLimits },
    );
  },
});

// Parent query that calls a nested query without any custom limits.
export const parentReadNoLimits = query(async (ctx): Promise<number> => {
  return await ctx.runQuery(api.nestedLimits.readAll, {});
});

// Parent mutation that calls a nested mutation with custom transaction limits.
export const parentInsertWithLimits = mutation({
  args: {
    count: v.number(),
    transactionLimits: transactionLimitsValidator,
  },
  handler: async (ctx, { count, transactionLimits }) => {
    await ctx.runMutation(
      api.nestedLimits.insertMany,
      { count },
      { transactionLimits },
    );
  },
});

// Parent query that runs a tightly-limited nested query, then reads more on
// its own. Used to verify the nested scope's limit does not leak back to the
// parent transaction once the nested call returns.
export const nestThenReadAll = query({
  args: {
    nestedReadCount: v.number(),
    transactionLimits: transactionLimitsValidator,
  },
  handler: async (
    ctx,
    { nestedReadCount, transactionLimits },
  ): Promise<number> => {
    await ctx.runQuery(
      api.nestedLimits.readN,
      { n: nestedReadCount },
      { transactionLimits },
    );
    const docs = await ctx.db.query("messages").collect();
    return docs.length;
  },
});

// Parent query that reads every message, has a nested query read them again,
// then reports how many index ranges the transaction has read.
export const readAllTwiceThenReportQueries = query(async (ctx) => {
  await ctx.db.query("messages").collect();
  await ctx.runQuery(api.nestedLimits.readAll, {});
  const metrics = await ctx.meta.getTransactionMetrics();
  return metrics.databaseQueries.used;
});
