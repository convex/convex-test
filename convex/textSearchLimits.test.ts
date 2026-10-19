import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";

const searchLimitError =
  "Search query scanned too many documents (fetched 1024)";

async function setupSearch(count: number) {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("messages", {
        body: "hello",
        author: i % 2 === 0 ? "alice" : "bob",
      });
    }
  });
  return t;
}

test.each([1023, 1024, 1025])(
  "collect searches with %i candidates",
  async (count) => {
    const t = await setupSearch(count);
    const result = t.run((ctx) =>
      ctx.db
        .query("messages")
        .withSearchIndex("body", (q) => q.search("body", "hello"))
        .collect(),
    );
    // The backend checks the cap before checking whether the source is exhausted.
    if (count < 1024) {
      expect(await result).toHaveLength(count);
    } else {
      await expect(result).rejects.toThrow(searchLimitError);
    }
  },
);

test.each([0, 10, 1024, 1025])(
  "take(%i) from a large search",
  async (limit) => {
    const t = await setupSearch(1100);
    const result = t.run((ctx) =>
      ctx.db
        .query("messages")
        .withSearchIndex("body", (q) => q.search("body", "hello"))
        .take(limit),
    );
    if (limit <= 1024) {
      expect(await result).toHaveLength(limit);
    } else {
      await expect(result).rejects.toThrow(searchLimitError);
    }
  },
);

test.each([true, false])(
  "search iteration with early exit: %s",
  async (earlyExit) => {
    const t = await setupSearch(1100);
    let count = 0;
    const result = t.run(async (ctx) => {
      for await (const doc of ctx.db
        .query("messages")
        .withSearchIndex("body", (q) => q.search("body", "hello"))) {
        expect(doc.body).toBe("hello");
        count++;
        if (earlyExit && count === 1024) break;
      }
    });
    if (earlyExit) {
      await result;
    } else {
      await expect(result).rejects.toThrow(searchLimitError);
    }
    expect(count).toBe(1024);
  },
);

test("search limit counts candidates before post-search filtering", async () => {
  const t = await setupSearch(1100);
  const search = () =>
    t.run((ctx) =>
      ctx.db
        .query("messages")
        .withSearchIndex("body", (q) => q.search("body", "hello"))
        .filter((q) => q.eq(q.field("author"), "alice"))
        .take(513),
    );
  await expect(search()).rejects.toThrow(searchLimitError);

  const withinLimit = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withSearchIndex("body", (q) => q.search("body", "hello"))
      .filter((q) => q.eq(q.field("author"), "alice"))
      .take(512),
  );
  expect(withinLimit).toHaveLength(512);
});

test("search index equality filters reduce the candidate count", async () => {
  const t = await setupSearch(1100);
  const result = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withSearchIndex("body", (q) =>
        q.search("body", "hello").eq("author", "alice"),
      )
      .collect(),
  );
  expect(result).toHaveLength(550);
});

test("ordinary queries are not subject to the search candidate limit", async () => {
  const t = await setupSearch(1100);
  const result = await t.run((ctx) => ctx.db.query("messages").collect());
  expect(result).toHaveLength(1100);
});
