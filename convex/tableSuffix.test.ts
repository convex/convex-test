import { expect, test } from "vitest";
import { convexTest } from "../index";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// "items" is a suffix of "bigitems": a scan of one must never see the other.
const schema = defineSchema({
  items: defineTable({ n: v.number() }),
  bigitems: defineTable({ n: v.number() }),
});

test("a scan sees only its table's pending writes when names share a suffix", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("bigitems", { n: 1 });
    await ctx.db.insert("items", { n: 2 });
    await ctx.db.insert("bigitems", { n: 3 });
    expect((await ctx.db.query("items").collect()).map((d) => d.n)).toEqual([
      2,
    ]);
    expect((await ctx.db.query("bigitems").collect()).map((d) => d.n)).toEqual([
      1, 3,
    ]);
  });
});

test("a scan sees only its table's committed documents when names share a suffix", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("bigitems", { n: 1 });
    await ctx.db.insert("items", { n: 2 });
  });
  await t.run(async (ctx) => {
    expect((await ctx.db.query("items").collect()).map((d) => d.n)).toEqual([
      2,
    ]);
    expect(await ctx.db.query("bigitems").collect()).toHaveLength(1);
  });
});
