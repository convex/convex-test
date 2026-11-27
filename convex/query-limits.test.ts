import { expect, test } from "vitest";
import { anyApi, defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest, defineTestApp } from "../index";

async function insertItems(t: ReturnType<typeof convexTest>, count: number) {
  await t.run(async (ctx: any) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("items", { n: i });
    }
  });
}

test("limits: documents rejected by .filter() count as read", async () => {
  const t = convexTest();
  await insertItems(t, 10);
  const metrics = await t.query(async (ctx: any) => {
    const matches = await ctx.db
      .query("items")
      .filter((q: any) => q.eq(q.field("n"), -1))
      .collect();
    expect(matches).toEqual([]);
    return await ctx.meta.getTransactionMetrics();
  });

  expect(metrics.documentsRead.used).toBe(10);
});

test("limits: documentsRead limit applies to documents rejected by .filter()", async () => {
  const t = convexTest({ transactionLimits: { documentsRead: 5 } });
  await insertItems(t, 10);
  await expect(
    t.query(async (ctx: any) =>
      ctx.db
        .query("items")
        .filter((q: any) => q.eq(q.field("n"), -1))
        .collect(),
    ),
  ).rejects.toThrow(/too many documents/i);
});

const app = defineTestApp({
  schema: defineSchema({ items: defineTable({ n: v.number() }) }),
});
const fixture = app.defineModules({
  calls: {
    recurse: app.query({
      args: { n: v.number() },
      returns: v.number(),
      handler: async (ctx, { n }): Promise<number> =>
        n === 0
          ? 0
          : 1 + (await ctx.runQuery(anyApi.calls.recurse, { n: n - 1 })),
    }),
  },
});

test("limits: nested ctx.runQuery calls are limited to a depth of 8", async () => {
  const t = fixture.createTest();
  expect(await t.query(fixture.api.calls.recurse, { n: 8 })).toBe(8);
  await expect(t.query(fixture.api.calls.recurse, { n: 9 })).rejects.toThrow(
    /call depth limit exceeded/,
  );
});
