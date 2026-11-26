import { expect, test } from "vitest";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "../index";

const schema = defineSchema({
  chunks: defineTable({
    orgId: v.string(),
    kind: v.string(),
    embedding: v.optional(v.array(v.float64())),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 2,
    filterFields: ["orgId"],
  }),
});

async function setup(docs: Array<Record<string, any>>) {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (const doc of docs) {
      await ctx.db.insert("chunks", { kind: "note", ...doc } as any);
    }
  });
  return t;
}

test("vector: the default limit is 10", async () => {
  const t = await setup(
    Array.from({ length: 12 }, (_, i) => ({ orgId: "a", embedding: [1, i] })),
  );
  const results = await t.action(async (ctx) =>
    ctx.vectorSearch("chunks", "by_embedding", { vector: [1, 0] }),
  );

  expect(results.length).toBe(10);
});

test("empty vector disjunctions preserve the unfiltered top ten", async () => {
  const t = await setup(
    Array.from({ length: 12 }, (_, i) => ({
      orgId: String(i),
      embedding: [1, i],
    })),
  );
  await t.action(async (ctx) => {
    const search = { vector: [1, 0] };
    const expected = await ctx.vectorSearch("chunks", "by_embedding", search);
    expect(expected).toHaveLength(10);
    expect(
      await ctx.vectorSearch("chunks", "by_embedding", {
        ...search,
        filter: (q) => q.or(),
      }),
    ).toEqual(expected);
    const one = await ctx.vectorSearch("chunks", "by_embedding", {
      ...search,
      filter: (q) => q.or(q.or(), q.eq("orgId", "0")),
    });
    expect(one).toEqual(expected.slice(0, 1));
  });
});

test("vector: limit is capped at 256", async () => {
  const t = await setup([{ orgId: "a", embedding: [1, 0] }]);
  await expect(
    t.action(async (ctx) =>
      ctx.vectorSearch("chunks", "by_embedding", {
        vector: [1, 0],
        limit: 257,
      }),
    ),
  ).rejects.toThrow(/at most 256 results/);
});

test("vector: the query vector must match the index dimensions", async () => {
  const t = await setup([{ orgId: "a", embedding: [1, 0] }]);
  await expect(
    t.action(
      async (ctx) =>
        (
          await ctx.vectorSearch("chunks", "by_embedding", {
            vector: [1, 0, 0],
          })
        ).length,
    ),
  ).rejects.toThrow(/Expected a vector with dimensions 2, received 3/);
});

test("vector: documents without an embedding are skipped", async () => {
  const t = await setup([{ orgId: "a", embedding: [1, 0] }, { orgId: "a" }]);
  const results = await t.action(async (ctx) =>
    ctx.vectorSearch("chunks", "by_embedding", { vector: [1, 0] }),
  );

  expect(results.length).toBe(1);
});

test("vector: documents whose vector has the wrong length are skipped", async () => {
  const t = await setup([
    { orgId: "a", embedding: [1, 0] },
    { orgId: "a", embedding: [1, 0, 0] },
  ]);
  const results = await t.action(async (ctx) =>
    ctx.vectorSearch("chunks", "by_embedding", { vector: [1, 0] }),
  );

  expect(results.length).toBe(1);
});

test("vector: filters may only use declared filterFields", async () => {
  const t = await setup([{ orgId: "a", embedding: [1, 0] }]);
  await expect(
    t.action(async (ctx) =>
      ctx.vectorSearch("chunks", "by_embedding", {
        vector: [1, 0],
        filter: (q: any) => q.eq("kind", "note"),
      }),
    ),
  ).rejects.toThrow(/isn't indexed for filtering/);
});
