import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";

test("by undefined", async () => {
  const schema = defineSchema({
    things: defineTable({
      field: v.optional(v.string()),
    }).index("field", ["field"]),
  });
  const t = convexTest(schema);
  const things = await t.run(async (ctx) => {
    await ctx.db.insert("things", {});
    await ctx.db.insert("things", { field: "some" });
    return await ctx.db
      .query("things")
      .filter((q) => q.eq(q.field("field"), undefined))
      .collect();
  });
  expect(things).toMatchObject([{}]);
});

test("and operator", async () => {
  const t = convexTest(schema);
  const result = await t.run(async (ctx) => {
    await ctx.db.insert("messages", { body: "hi", author: "Alice" });
    await ctx.db.insert("messages", { body: "hello", author: "Bob" });
    return await ctx.db
      .query("messages")
      .filter((q) =>
        q.and(q.eq(q.field("body"), "hi"), q.eq(q.field("author"), "Alice")),
      )
      .collect();
  });
  expect(result).toMatchObject([{ body: "hi", author: "Alice" }]);
});

test("or operator", async () => {
  const t = convexTest(schema);
  const result = await t.run(async (ctx) => {
    await ctx.db.insert("messages", { body: "hi", author: "Alice" });
    await ctx.db.insert("messages", { body: "hello", author: "Bob" });
    return await ctx.db
      .query("messages")
      .filter((q) =>
        q.or(q.eq(q.field("body"), "hi"), q.eq(q.field("body"), "hello")),
      )
      .collect();
  });
  expect(result).toMatchObject([
    { body: "hi", author: "Alice" },
    { body: "hello", author: "Bob" },
  ]);
});

test("neq operator", async () => {
  const t = convexTest(schema);
  const result = await t.run(async (ctx) => {
    await ctx.db.insert("messages", { body: "hi", author: "Alice" });
    await ctx.db.insert("messages", { body: "hello", author: "Bob" });
    return await ctx.db
      .query("messages")
      .filter((q) => q.neq(q.field("body"), "hi"))
      .collect();
  });
  expect(result).toMatchObject([{ body: "hello", author: "Bob" }]);
});

test("math operators", async () => {
  const t = convexTest(schema);
  const result = await t.run(async (ctx) => {
    await ctx.db.insert("messages", { body: "hi", author: "Alice", score: 42 });
    await ctx.db.insert("messages", {
      body: "hello",
      author: "Bob",
      score: 10,
    });
    return await ctx.db
      .query("messages")
      .filter((q) =>
        q.and(
          q.gt(q.field("score"), 41),
          q.gte(q.field("score"), 42),
          q.lt(q.add(q.field("score"), -2), 41),
          q.lte(q.sub(q.field("score"), 2), 40),
          q.eq(q.mul(q.div(q.field("score"), 6), 2), 14),
          q.eq(q.mod(q.field("score"), 2), 0),
        ),
      )
      .collect();
  });
  expect(result).toMatchObject([{ body: "hi", author: "Alice", score: 42 }]);
});

test("nested field", async () => {
  const schema = defineSchema({
    things: defineTable({
      field: v.optional(
        v.object({
          nested: v.string(),
        }),
      ),
    }).index("fieldNested", ["field.nested"]),
  });
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("things", {});
    await ctx.db.insert("things", { field: { nested: "some" } });
    const things = await ctx.db
      .query("things")
      .filter((q) => q.eq(q.field("field.nested"), "some"))
      .collect();
    expect(things).toMatchObject([{ field: { nested: "some" } }]);
    const thingsByIndex = await ctx.db
      .query("things")
      // `as any` because of a bug in Convex index types
      .withIndex("fieldNested", (q) => q.eq("field.nested", "some" as any))
      .collect();
    expect(thingsByIndex).toMatchObject([{ field: { nested: "some" } }]);
  });
});

test.each([
  { left: undefined, right: null },
  { left: null, right: -1n },
  { left: 5n, right: 0 },
  { left: -0, right: 0 },
  { left: 5, right: "abc" },
  { left: [9], right: [10] },
])("ordered filters compare $left before $right", async ({ left, right }) => {
  const t = convexTest();
  await t.run(async (ctx) => {
    const smaller = await ctx.db.insert(
      "items",
      left === undefined ? {} : { value: left },
    );
    const larger = await ctx.db.insert("items", { value: right });
    for (const [operator, expected] of [
      ["lt", [smaller]],
      ["lte", [smaller, larger]],
      ["gt", []],
      ["gte", [larger]],
    ] as const) {
      const rows = await ctx.db
        .query("items")
        .filter((q) => q[operator](q.field("value"), right))
        .collect();
      expect(rows.map((row) => row._id)).toEqual(expected);
    }
  });
});
