import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { PaginationResult } from "convex/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

test("paginate", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "michal", body: "boo" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello2" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello3" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello4" });
    await ctx.db.insert("messages", { author: "michal", body: "boing" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello5" });
  });
  const { continueCursor, isDone, page } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: null,
      numItems: 2,
    },
  });
  expect(page).toMatchObject([
    { author: "sarah", body: "hello1" },
    { author: "sarah", body: "hello2" },
  ]);
  expect(isDone).toEqual(false);
  const {
    continueCursor: continueCursor2,
    isDone: isDone2,
    page: page2,
  } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: continueCursor,
      numItems: 4,
    },
  });
  expect(page2).toMatchObject([
    { author: "sarah", body: "hello3" },
    { author: "sarah", body: "hello4" },
    { author: "sarah", body: "hello5" },
  ]);
  expect(isDone2).toEqual(true);

  // Querying after done should return nothing.
  const { isDone: isDone3, page: page3 } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: continueCursor2,
      numItems: 4,
    },
  });
  expect(page3).toMatchObject([]);
  expect(isDone3).toEqual(true);
});

test("paginate with maximumRowsRead", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: `msg${i}`,
      });
    }
  });

  // With maximumRowsRead=3, we should get at most 3 docs and SplitRequired
  const result = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: null,
      numItems: 10,
      maximumRowsRead: 3,
    },
  })) as PaginationResult<any>;

  expect(result.page.length).toBeLessThanOrEqual(3);
  expect(result.pageStatus).toEqual("SplitRequired");
  expect(result.splitCursor).toBeTruthy();
  expect(result.isDone).toEqual(false);

  // Continue from the continueCursor
  const result2 = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: result.continueCursor,
      numItems: 10,
    },
  })) as PaginationResult<any>;

  // Combined pages should cover all 10 docs
  expect(result.page.length + result2.page.length).toEqual(10);
  expect(result2.isDone).toEqual(true);
});

test("paginate with maximumBytesRead", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: "x".repeat(100),
      });
    }
  });

  // Use a very small byte limit to force early termination
  const result = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: null,
      numItems: 10,
      maximumBytesRead: 1, // Very small, should stop after first doc
    },
  })) as PaginationResult<any>;

  expect(result.page.length).toBeLessThanOrEqual(1);
  expect(result.pageStatus).toEqual("SplitRequired");
  expect(result.isDone).toEqual(false);
});

test("paginate with filter and maximumRowsRead", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    // Insert many docs, only some match the filter
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", {
        author: i % 3 === 0 ? "sarah" : "michal",
        body: `msg${i}`,
      });
    }
  });

  // Filter for sarah (4 docs: 0, 3, 6, 9), but maximumRowsRead=5
  // means we scan at most 5 rows from the pipeline
  const result = (await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: null,
      numItems: 10,
      maximumRowsRead: 5,
    },
  })) as PaginationResult<any>;

  // Should have scanned 5 rows, getting some sarah docs but not all
  expect(result.pageStatus).toEqual("SplitRequired");
  expect(result.isDone).toEqual(false);
});

test("paginate with endCursor", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: `msg${i}`,
      });
    }
  });

  // First get a page to get a cursor
  const result1 = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: null,
      numItems: 2,
    },
  })) as PaginationResult<any>;

  expect(result1.page.length).toEqual(2);
  expect(result1.isDone).toEqual(false);

  // Now get the next page
  const result2 = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: result1.continueCursor,
      numItems: 2,
    },
  })) as PaginationResult<any>;

  expect(result2.page.length).toEqual(2);

  // Use endCursor to re-fetch the second page bounded
  const result3 = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: result1.continueCursor,
      numItems: 100, // Large numItems, but bounded by endCursor
      endCursor: result2.continueCursor,
    },
  })) as PaginationResult<any>;

  // Should get the same docs as result2
  expect(result3.page.length).toEqual(result2.page.length);
});
test("paginate with index on optional field with undefined values", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", {
      author: "sarah",
      body: "hello1",
      score: 10,
    });
    await ctx.db.insert("messages", { author: "sarah", body: "hello2" }); // score undefined
    await ctx.db.insert("messages", {
      author: "sarah",
      body: "hello3",
      score: 5,
    });
    await ctx.db.insert("messages", { author: "sarah", body: "hello4" }); // score undefined
  });
  const { continueCursor, isDone, page } = await t.query(
    api.pagination.listWithOptionalFieldIndex,
    {
      author: "sarah",
      paginationOptions: {
        cursor: null,
        numItems: 2,
      },
    },
  );
  // undefined scores should sort before defined scores
  expect(page).toMatchObject([
    { author: "sarah", body: "hello2" }, // score undefined
    { author: "sarah", body: "hello4" }, // score undefined
  ]);
  expect(isDone).toEqual(false);
  const { isDone: isDone2, page: page2 } = await t.query(
    api.pagination.listWithOptionalFieldIndex,
    {
      author: "sarah",
      paginationOptions: {
        cursor: continueCursor,
        numItems: 4,
      },
    },
  );
  // then defined scores in ascending order
  expect(page2).toMatchObject([
    { author: "sarah", body: "hello3", score: 5 },
    { author: "sarah", body: "hello1", score: 10 },
  ]);
  expect(isDone2).toEqual(true);
});

test("paginate with deletes", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "michal", body: "boo" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello2" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello3" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello4" });
    await ctx.db.insert("messages", { author: "michal", body: "boing" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello5" });
  });
  const { continueCursor, isDone, page } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: null,
      numItems: 2,
    },
  });
  expect(page).toMatchObject([
    { author: "sarah", body: "hello1" },
    { author: "sarah", body: "hello2" },
  ]);
  expect(isDone).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page[1]._id);
  });
  const { isDone: isDone2, page: page2 } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: continueCursor,
      numItems: 4,
    },
  });
  expect(page2).toMatchObject([
    { author: "sarah", body: "hello3" },
    { author: "sarah", body: "hello4" },
    { author: "sarah", body: "hello5" },
  ]);
  expect(isDone2).toEqual(true);
});

test("paginate with deletes and indexes", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello1" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello2" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello3" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello4" });
  });
  const { continueCursor, isDone, page } = await t.query(
    api.pagination.listWithIndex,
    {
      author: "jordan",
      paginationOptions: {
        cursor: null,
        numItems: 1,
      },
    },
  );
  expect(page).toMatchObject([{ author: "jordan", body: "hello1" }]);
  expect(isDone).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page[0]._id);
  });
  const {
    isDone: isDone2,
    page: page2,
    continueCursor: continueCursor2,
  } = await t.query(api.pagination.listWithIndex, {
    author: "jordan",
    paginationOptions: {
      cursor: continueCursor,
      numItems: 2,
    },
  });
  expect(page2).toMatchObject([
    { author: "jordan", body: "hello2" },
    { author: "jordan", body: "hello3" },
  ]);
  expect(isDone2).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page2[1]._id);
  });
  const { isDone: isDone3, page: page3 } = await t.query(
    api.pagination.listWithIndex,
    {
      author: "jordan",
      paginationOptions: {
        cursor: continueCursor2,
        numItems: 1,
      },
    },
  );
  expect(page3).toMatchObject([{ author: "jordan", body: "hello4" }]);
  expect(isDone3).toEqual(true);
});

test("paginate with deletes and composite index", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello2" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello4" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello3" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello1" });
  });
  const { continueCursor, isDone, page } = await t.query(
    api.pagination.listWithCompositeIndex,
    {
      author: "jordan",
      paginationOptions: {
        cursor: null,
        numItems: 1,
      },
    },
  );
  expect(page).toMatchObject([{ author: "jordan", body: "hello1" }]);
  expect(isDone).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page[0]._id);
  });
  const {
    isDone: isDone2,
    page: page2,
    continueCursor: continueCursor2,
  } = await t.query(api.pagination.listWithCompositeIndex, {
    author: "jordan",
    paginationOptions: {
      cursor: continueCursor,
      numItems: 2,
    },
  });
  expect(page2).toMatchObject([
    { author: "jordan", body: "hello2" },
    { author: "jordan", body: "hello3" },
  ]);
  expect(isDone2).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page2[1]._id);
  });
  const { isDone: isDone3, page: page3 } = await t.query(
    api.pagination.listWithCompositeIndex,
    {
      author: "jordan",
      paginationOptions: {
        cursor: continueCursor2,
        numItems: 1,
      },
    },
  );
  expect(page3).toMatchObject([{ author: "jordan", body: "hello4" }]);
  expect(isDone3).toEqual(true);
});

const paginateOnce = (ctx: QueryCtx) =>
  ctx.db.query("messages").paginate({ cursor: null, numItems: 10 });

test("multiple paginate calls in one query throw", async () => {
  const t = convexTest({ schema });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  await expect(
    t.query(async (ctx) => {
      await paginateOnce(ctx);
      await paginateOnce(ctx);
    }),
  ).rejects.toThrow(/single paginated query/);
});

test("a single paginate call is allowed", async () => {
  const t = convexTest({ schema });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  const { page } = await t.query(async (ctx) => paginateOnce(ctx));
  expect(page).toMatchObject([{ author: "sarah", body: "hello" }]);
});

test("paginate in separate transactions does not throw", async () => {
  const t = convexTest({ schema });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  // Each call is its own transaction, so the count resets.
  const a = await t.query(async (ctx) => paginateOnce(ctx));
  const b = await t.query(async (ctx) => paginateOnce(ctx));
  expect(a.page.length).toBe(1);
  expect(b.page.length).toBe(1);
});

test("an action can paginate in separate query transactions", async () => {
  const t = convexTest({ schema });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  // An action invoking two queries, each paginating once. Each query is its
  // own transaction, so this is allowed.
  const result = await t.action(async (ctx) => {
    const first = await ctx.runQuery(api.pagination.listAll, {
      paginationOptions: { cursor: null, numItems: 10 },
    });
    const second = await ctx.runQuery(api.pagination.listAll, {
      paginationOptions: { cursor: null, numItems: 10 },
    });
    return { first, second };
  });
  expect(result.first.page.length).toBe(1);
  expect(result.second.page.length).toBe(1);
});

test.each(["query", "mutation", "run"] as const)(
  "multiple paginated queries called from a %s",
  async (udfType) => {
    const t = convexTest({ schema });
    const handler = async (ctx: QueryCtx) => {
      await ctx.runQuery(api.pagination.listAll, {
        paginationOptions: { cursor: null, numItems: 10 },
      });
      await ctx.runQuery(api.pagination.listAll, {
        paginationOptions: { cursor: null, numItems: 10 },
      });
    };
    if (udfType === "query") {
      await expect(t.query(handler)).rejects.toThrow(
        /single paginated query.*per query/,
      );
    } else {
      await expect(
        udfType === "mutation" ? t.mutation(handler) : t.run(handler),
      ).resolves.toBeNull();
    }

    // A failed transaction must not consume the next transaction's allowance.
    await expect(t.query(paginateOnce)).resolves.toMatchObject({ page: [] });
  },
);

test.each(["mutation", "run"] as const)(
  "multiple direct paginate calls are allowed in a %s",
  async (udfType) => {
    const t = convexTest({ schema });
    const handler = async (ctx: MutationCtx) => {
      await ctx.db.insert("messages", { author: "sarah", body: "hello" });
      const first = await paginateOnce(ctx);
      const second = await paginateOnce(ctx);
      return { first, second };
    };
    const result =
      udfType === "mutation" ? await t.mutation(handler) : await t.run(handler);
    expect(result.first.page).toMatchObject([
      { author: "sarah", body: "hello" },
    ]);
    expect(result.second).toEqual(result.first);
  },
);

test.each([false, true])(
  "a query called from a mutation still enforces its limit (nested: %s)",
  async (nested) => {
    const t = convexTest({ schema });
    await expect(
      t.mutation(async (ctx) => {
        await ctx.runQuery(internal.pagination.paginateTwice, { nested });
      }),
    ).rejects.toThrow(/single paginated query.*per query/);
  },
);
