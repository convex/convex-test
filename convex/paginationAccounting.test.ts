import { expect, test } from "vitest";
import { getDocumentSize } from "convex/values";
import { convexTest } from "../index";
import schema from "./schema";
import { api } from "./_generated/api";

async function setup() {
  const t = convexTest({ schema });
  const docs = await t.run(async (ctx) => {
    const result = [];
    for (let i = 0; i < 5; i++) {
      const id = await ctx.db.insert("messages", {
        author: i % 2 === 0 ? "alice" : "bob",
        body: `${i}:${"x".repeat(100)}`,
      });
      result.push((await ctx.db.get(id))!);
    }
    return result;
  });
  return { t, docs };
}

const bytes = (docs: { _id: string; _creationTime: number }[]) =>
  docs.reduce((sum, doc) => sum + getDocumentSize(doc), 0);

test.each(["alice", "nobody"])(
  "pagination charges rows rejected by a filter for %s",
  async (author) => {
    const { t, docs } = await setup();
    const { result, metrics } = await t.query(async (ctx) => {
      const result = await ctx.db
        .query("messages")
        .withIndex("author_body", (q) => q.eq("author", "alice"))
        .filter((q) => q.eq(q.field("author"), author))
        .paginate({ cursor: null, numItems: 10 });
      return { result, metrics: await ctx.meta.getTransactionMetrics() };
    });
    const scanned = docs.filter((doc) => doc.author === "alice");
    expect(result.page).toHaveLength(author === "alice" ? 3 : 0);
    expect(metrics.documentsRead.used).toBe(3);
    expect(metrics.bytesRead.used).toBe(bytes(scanned));
  },
);

test.each([{ maximumRowsRead: 2 }, { maximumBytesRead: 1 }])(
  "pagination only charges scanned rows when stopped by %j",
  async (limits) => {
    const { t, docs } = await setup();
    const { result, metrics } = await t.query(async (ctx) => {
      const result = await ctx.db
        .query("messages")
        .withIndex("author_body")
        .filter((q) => q.eq(q.field("author"), "nobody"))
        .paginate({ cursor: null, numItems: 10, ...limits });
      return { result, metrics: await ctx.meta.getTransactionMetrics() };
    });
    const count = "maximumRowsRead" in limits ? 2 : 1;
    expect(result.page).toEqual([]);
    expect(result.pageStatus).toBe("SplitRequired");
    expect(metrics.documentsRead.used).toBe(count);
    expect(metrics.bytesRead.used).toBe(
      bytes(docs.filter((d) => d.author === "alice").slice(0, count)),
    );
  },
);

test.each([
  { limits: { bytesRead: 1 }, error: /Read too much data/ },
  { limits: { documentsRead: 1 }, error: /Scanned too many documents/ },
])(
  "filtered pagination enforces transaction limits: $limits",
  async ({ limits, error }) => {
    const { t } = await setup();
    const first = await t.query((ctx) =>
      ctx.db.query("messages").paginate({ cursor: null, numItems: 2 }),
    );
    for (const endCursor of [null, first.continueCursor, "_end_cursor"]) {
      await expect(
        t.query(async (ctx) =>
          ctx.runQuery(
            api.pagination.list,
            {
              author: "nobody",
              paginationOptions: { cursor: null, numItems: 10, endCursor },
            },
            { transactionLimits: limits },
          ),
        ),
      ).rejects.toThrow(error);
    }
  },
);

test.each(["asc", "desc"] as const)(
  "bounded pagination counts filtered boundary rows in %s order",
  async (order) => {
    const { t, docs } = await setup();
    const first = await t.query((ctx) =>
      ctx.db
        .query("messages")
        .withIndex("author_body")
        .order(order)
        .paginate({ cursor: null, numItems: 1 }),
    );
    const second = await t.query((ctx) =>
      ctx.db
        .query("messages")
        .withIndex("author_body")
        .order(order)
        .paginate({ cursor: first.continueCursor, numItems: 2 }),
    );
    const { result, metrics } = await t.query(async (ctx) => {
      const result = await ctx.db
        .query("messages")
        .withIndex("author_body")
        .order(order)
        .filter((q) => q.eq(q.field("author"), "nobody"))
        .paginate({
          cursor: first.continueCursor,
          endCursor: second.continueCursor,
          numItems: 10,
        });
      return { result, metrics: await ctx.meta.getTransactionMetrics() };
    });
    expect(result.page).toEqual([]);
    expect(result.continueCursor).toBe(second.continueCursor);
    expect(metrics.documentsRead.used).toBe(2);
    expect(metrics.bytesRead.used).toBe(bytes(second.page));
    expect(metrics.bytesRead.used).toBeLessThan(bytes(docs));
  },
);

test.each([{ maximumRowsRead: 1 }, { maximumBytesRead: 1 }])(
  "end cursors preserve the complete interval despite %j",
  async (limits) => {
    const { t } = await setup();
    const first = await t.query((ctx) =>
      ctx.db
        .query("messages")
        .withIndex("author_body")
        .paginate({ cursor: null, numItems: 3 }),
    );
    for (const endCursor of [first.continueCursor, "_end_cursor"]) {
      const { result, metrics } = await t.query(async (ctx) => {
        const result = await ctx.db
          .query("messages")
          .withIndex("author_body")
          .paginate({ cursor: null, endCursor, numItems: 1, ...limits });
        return { result, metrics: await ctx.meta.getTransactionMetrics() };
      });
      expect(result.page).toHaveLength(endCursor === "_end_cursor" ? 5 : 3);
      expect(result.pageStatus).not.toBe("SplitRequired");
      expect(metrics.documentsRead.used).toBe(result.page.length);
      expect(metrics.bytesRead.used).toBe(bytes(result.page));
    }
  },
);

test("page size stops accounting after the last matching row", async () => {
  const { t, docs } = await setup();
  const { result, metrics } = await t.query(async (ctx) => {
    const result = await ctx.db
      .query("messages")
      .withIndex("author_body")
      .filter((q) => q.eq(q.field("author"), "bob"))
      .paginate({ cursor: null, numItems: 1 });
    return { result, metrics: await ctx.meta.getTransactionMetrics() };
  });
  expect(result.page).toHaveLength(1);
  expect(metrics.documentsRead.used).toBe(4);
  expect(metrics.bytesRead.used).toBe(
    bytes([...docs.filter((d) => d.author === "alice"), docs[1]]),
  );
});
