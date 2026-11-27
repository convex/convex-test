import { expect, test } from "vitest";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "../index";

test("writes: insert rejects a value that carries _id and _creationTime", async () => {
  const t = convexTest();
  await expect(
    t.run(async (ctx: any) => {
      const id = await ctx.db.insert("posts", { title: "hi" });
      const post = await ctx.db.get(id);
      await ctx.db.insert("archive", post);
    }),
  ).rejects.toThrow(/doesn't match '_id' field/);
});

test("writes: top-level fields can't start with an underscore", async () => {
  const t = convexTest();
  await expect(
    t.run(async (ctx: any) => ctx.db.insert("notes", { _internal: true })),
  ).rejects.toThrow(/starts with an underscore/);
});

test("writes: patch can't add an underscore field", async () => {
  const t = convexTest();
  await expect(
    t.run(async (ctx: any) => {
      const id = await ctx.db.insert("notes", { body: "x" });
      await ctx.db.patch(id, { _internal: true });
    }),
  ).rejects.toThrow(/starts with an underscore/);
});

test("writes: documents may be nested at most 16 levels deep", async () => {
  const node = (depth: number): any =>
    depth === 0
      ? { type: "text", text: "hi" }
      : { type: "bulletList", content: [node(depth - 1)] };
  const t = convexTest();
  await expect(
    t.run(async (ctx: any) => ctx.db.insert("docs", { doc: node(8) })),
  ).rejects.toThrow(/too nested/);
});

test("writes: arrays may have at most 8192 elements", async () => {
  const t = convexTest();
  await expect(
    t.run(async (ctx: any) =>
      ctx.db.insert("events", {
        ids: Array.from({ length: 8193 }, (_, i) => i),
      }),
    ),
  ).rejects.toThrow(/Array length is too long/);
});

test("writes: objects may have at most 1024 fields", async () => {
  const t = convexTest();
  const wide = Object.fromEntries(
    Array.from({ length: 1025 }, (_, i) => [`f${i}`, i]),
  );
  await expect(
    t.run(async (ctx: any) => ctx.db.insert("rows", { wide })),
  ).rejects.toThrow(/too many fields/);
});

test("writes: insert rejects an invalid table name", async () => {
  const t = convexTest();
  await expect(
    t.run(async (ctx: any) => ctx.db.insert("audit-log", { n: 1 })),
  ).rejects.toThrow(/invalid character/);
});

test("writes: a schema that declares _id and _creationTime still accepts inserts", async () => {
  const schema = defineSchema({
    things: defineTable({
      _id: v.id("things"),
      _creationTime: v.number(),
      name: v.string(),
    }),
  });
  const t = convexTest(schema);
  const name = await t.run(async (ctx) => {
    const id = await ctx.db.insert("things", { name: "a" });
    return (await ctx.db.get(id))!.name;
  });

  expect(name).toBe("a");
});

test("writes: patching a field to undefined that the schema doesn't declare is allowed", async () => {
  const schema = defineSchema({ things: defineTable({ name: v.string() }) });
  const t = convexTest(schema);
  await t.run(async (ctx: any) => {
    const id = await ctx.db.insert("things", { name: "a" });

    await ctx.db.patch(id, { legacy: undefined });
  });
});

test("writes: schema validation rejects an undeclared field named toString", async () => {
  const schema = defineSchema({ things: defineTable({ name: v.string() }) });
  const t = convexTest(schema);
  await expect(
    t.run(async (ctx: any) =>
      ctx.db.insert("things", { name: "a", toString: "x" }),
    ),
  ).rejects.toThrow(/toString/);
});
