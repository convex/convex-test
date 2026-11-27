import { expect, test } from "vitest";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "../index";

const schema = defineSchema({
  tasks: defineTable({ status: v.string(), n: v.number() }).index("by_status", [
    "status",
  ]),
});

async function setup(limits?: { documentsRead: number }) {
  const t = convexTest({ schema, transactionLimits: limits ?? false });
  await t.run(async (ctx) => {
    for (let n = 0; n < 3; n++) {
      await ctx.db.insert("tasks", { status: "open", n });
      await ctx.db.insert("tasks", { status: "done", n });
    }
  });
  return t;
}

test("pagination: a cursor from a different query is rejected", async () => {
  const t = await setup();
  const { continueCursor } = await t.query(async (ctx) =>
    ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .paginate({ numItems: 2, cursor: null }),
  );
  await expect(
    t.query(async (ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", "done"))
        .paginate({ numItems: 2, cursor: continueCursor }),
    ),
  ).rejects.toThrow(/InvalidCursor/);
});

test("pagination: numItems must be at least 1", async () => {
  const t = await setup();
  await expect(
    t.query(async (ctx) =>
      ctx.db.query("tasks").paginate({ numItems: 0, cursor: null }),
    ),
  ).rejects.toThrow(/Must request at least 1 document while paginating/);
});

test("pagination: numItems is capped at 32000", async () => {
  const t = await setup();
  await expect(
    t.query(async (ctx) =>
      ctx.db.query("tasks").paginate({ numItems: 32_001, cursor: null }),
    ),
  ).rejects.toThrow(/Requested too many items: 32001/);
});

test("pagination: maximumRowsRead must be greater than 0", async () => {
  const t = await setup();
  await expect(
    t.query(async (ctx) =>
      ctx.db
        .query("tasks")
        .paginate({ numItems: 2, cursor: null, maximumRowsRead: 0 }),
    ),
  ).rejects.toThrow(/must be greater than 0/);
});

test("pagination: an endCursor whose document was deleted still bounds the page", async () => {
  const t = await setup();
  const first = await t.query(async (ctx) =>
    ctx.db.query("tasks").paginate({ numItems: 2, cursor: null }),
  );
  await t.run(async (ctx) => {
    await ctx.db.delete(first.page[1]._id);
  });
  const refetched = await t.query(async (ctx) =>
    ctx.db.query("tasks").paginate({
      numItems: 2,
      cursor: null,
      endCursor: first.continueCursor,
    }),
  );

  expect(refetched.isDone).toBe(false);
  expect(refetched.continueCursor).toBe(first.continueCursor);
});

test("pagination: hitting the read limit returns a SplitRequired page", async () => {
  const t = await setup({ documentsRead: 4 });
  const result = await t.query(async (ctx) =>
    ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("status"), "missing"))
      .paginate({ numItems: 10, cursor: null }),
  );

  expect(result.pageStatus).toBe("SplitRequired");
  expect(result.isDone).toBe(false);
});
