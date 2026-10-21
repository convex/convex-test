import { expect, test } from "vitest";
import { convexTest } from "../index";
import {
  defineSchema,
  defineTable,
  GenericDatabaseReader,
} from "convex/server";
import { v } from "convex/values";

// Queries only visit the documents of the table they read from. These tests
// check that every way of reading a table still sees exactly that table's
// documents as other tables grow, and as documents are inserted, patched and
// deleted in committed, in-flight and rolled-back transactions.

const OTHER_TABLES = ["alpha", "beta", "gamma", "delta"] as const;

const schema = defineSchema({
  messages: defineTable({ author: v.string(), body: v.string() })
    .index("author", ["author"])
    .searchIndex("body", { searchField: "body", filterFields: ["author"] }),
  alpha: defineTable({ author: v.string(), body: v.string() }).index("author", [
    "author",
  ]),
  beta: defineTable({ author: v.string(), body: v.string() }).index("author", [
    "author",
  ]),
  gamma: defineTable({ author: v.string(), body: v.string() }),
  delta: defineTable({ author: v.string(), body: v.string() }),
});

async function readMessages(db: GenericDatabaseReader<any>) {
  const scan = await db.query("messages").collect();
  const scanDesc = await db.query("messages").order("desc").collect();
  const byCreationTime = await db
    .query("messages")
    .withIndex("by_creation_time")
    .collect();
  const bySarah = await db
    .query("messages")
    .withIndex("author", (q: any) => q.eq("author", "sarah"))
    .collect();
  const searchHello = await db
    .query("messages")
    .withSearchIndex("body", (q: any) => q.search("body", "hello"))
    .collect();
  return {
    scan: scan.map((doc) => doc.body),
    scanDesc: scanDesc.map((doc) => doc.body),
    byCreationTime: byCreationTime.map((doc) => doc.body),
    bySarah: bySarah.map((doc) => doc.body),
    searchHello: searchHello.map((doc) => doc.body).sort(),
  };
}

test("queries only see their own table among many tables", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (let i = 0; i < 5; i++) {
      // Interleave inserts so ids of different tables are mixed together.
      for (const table of OTHER_TABLES) {
        await ctx.db.insert(table, { author: "sarah", body: `hello ${i}` });
      }
      await ctx.db.insert("messages", {
        author: i % 2 === 0 ? "sarah" : "michal",
        body: `hello ${i}`,
      });
    }
  });

  const result = await t.run(async (ctx) => readMessages(ctx.db));
  expect(result).toEqual({
    scan: ["hello 0", "hello 1", "hello 2", "hello 3", "hello 4"],
    scanDesc: ["hello 4", "hello 3", "hello 2", "hello 1", "hello 0"],
    byCreationTime: ["hello 0", "hello 1", "hello 2", "hello 3", "hello 4"],
    bySarah: ["hello 0", "hello 2", "hello 4"],
    searchHello: ["hello 0", "hello 1", "hello 2", "hello 3", "hello 4"],
  });

  // Tables that were never written to are empty.
  const alphaByMichal = await t.run(async (ctx) =>
    ctx.db
      .query("alpha")
      .withIndex("author", (q) => q.eq("author", "michal"))
      .collect(),
  );
  expect(alphaByMichal).toEqual([]);
  const counts = await t.run(async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of OTHER_TABLES) {
      counts[table] = (await ctx.db.query(table).collect()).length;
    }
    return counts;
  });
  expect(counts).toEqual({ alpha: 5, beta: 5, gamma: 5, delta: 5 });
});

test("committed deletes and patches are reflected", async () => {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < 4; i++) {
      await ctx.db.insert("alpha", { author: "sarah", body: `hello ${i}` });
      ids.push(
        await ctx.db.insert("messages", {
          author: "sarah",
          body: `hello ${i}`,
        }),
      );
    }
    return ids;
  });

  await t.run(async (ctx) => {
    await ctx.db.delete(ids[1]);
    await ctx.db.patch(ids[2], { author: "michal" });
    for (const doc of await ctx.db.query("alpha").collect()) {
      await ctx.db.delete(doc._id);
    }
  });

  const result = await t.run(async (ctx) => readMessages(ctx.db));
  expect(result).toEqual({
    scan: ["hello 0", "hello 2", "hello 3"],
    scanDesc: ["hello 3", "hello 2", "hello 0"],
    byCreationTime: ["hello 0", "hello 2", "hello 3"],
    bySarah: ["hello 0", "hello 3"],
    searchHello: ["hello 0", "hello 2", "hello 3"],
  });
  expect(await t.run(async (ctx) => ctx.db.query("alpha").collect())).toEqual(
    [],
  );

  // A table that was emptied can be written to again.
  await t.run(async (ctx) => {
    await ctx.db.insert("alpha", { author: "sarah", body: "again" });
  });
  const alpha = await t.run(async (ctx) => ctx.db.query("alpha").collect());
  expect(alpha.map((doc) => doc.body)).toEqual(["again"]);
});

test("writes inside a transaction are seen by its own queries", async () => {
  const t = convexTest(schema);
  const committedId = await t.run(async (ctx) => {
    await ctx.db.insert("beta", { author: "sarah", body: "hello beta" });
    return await ctx.db.insert("messages", {
      author: "sarah",
      body: "hello committed",
    });
  });

  const inside = await t.run(async (ctx) => {
    const tempId = await ctx.db.insert("messages", {
      author: "sarah",
      body: "hello temp",
    });
    await ctx.db.insert("messages", { author: "michal", body: "hello kept" });
    await ctx.db.insert("gamma", { author: "sarah", body: "hello gamma" });
    const afterInsert = await readMessages(ctx.db);
    await ctx.db.delete(tempId);
    await ctx.db.delete(committedId);
    const afterDelete = await readMessages(ctx.db);
    return { afterInsert, afterDelete };
  });
  expect(inside.afterInsert).toEqual({
    scan: ["hello committed", "hello temp", "hello kept"],
    scanDesc: ["hello kept", "hello temp", "hello committed"],
    byCreationTime: ["hello committed", "hello temp", "hello kept"],
    bySarah: ["hello committed", "hello temp"],
    searchHello: ["hello committed", "hello kept", "hello temp"],
  });
  expect(inside.afterDelete).toEqual({
    scan: ["hello kept"],
    scanDesc: ["hello kept"],
    byCreationTime: ["hello kept"],
    bySarah: [],
    searchHello: ["hello kept"],
  });

  // The document inserted and deleted in the same transaction never shows up.
  const after = await t.run(async (ctx) => readMessages(ctx.db));
  expect(after).toEqual(inside.afterDelete);
});

test("rolled back writes are not seen", async () => {
  const t = convexTest(schema);
  const keptId = await t.run(async (ctx) =>
    ctx.db.insert("messages", { author: "sarah", body: "hello kept" }),
  );

  await expect(
    t.run(async (ctx) => {
      await ctx.db.insert("messages", { author: "sarah", body: "hello lost" });
      await ctx.db.insert("delta", { author: "sarah", body: "hello lost" });
      await ctx.db.delete(keptId);
      throw new Error("roll back");
    }),
  ).rejects.toThrow("roll back");

  const result = await t.run(async (ctx) => readMessages(ctx.db));
  expect(result).toEqual({
    scan: ["hello kept"],
    scanDesc: ["hello kept"],
    byCreationTime: ["hello kept"],
    bySarah: ["hello kept"],
    searchHello: ["hello kept"],
  });
  expect(await t.run(async (ctx) => ctx.db.query("delta").collect())).toEqual(
    [],
  );
});
