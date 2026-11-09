import { expect, test } from "vitest";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

test("text search skips missing optional search fields", async () => {
  const schema = defineSchema({
    docs: defineTable({
      org: v.string(),
      summaryText: v.optional(v.string()),
    }).searchIndex("search_summary", {
      searchField: "summaryText",
      filterFields: ["org"],
    }),
  });
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("docs", { org: "a", summaryText: "budget review" });
    await ctx.db.insert("docs", { org: "a" });
    await ctx.db.insert("docs", { org: "b" });
    await ctx.db.insert("docs", { org: "b", summaryText: "budget planning" });
    await ctx.db.insert("docs", { org: "a", summaryText: "meeting notes" });
  });

  const results = await t.run(async (ctx) =>
    ctx.db
      .query("docs")
      .withSearchIndex("search_summary", (q) =>
        q.search("summaryText", "budget"),
      )
      .take(10),
  );
  expect(results).toMatchObject([
    { org: "a", summaryText: "budget review" },
    { org: "b", summaryText: "budget planning" },
  ]);

  const filteredResults = await t.run(async (ctx) =>
    ctx.db
      .query("docs")
      .withSearchIndex("search_summary", (q) =>
        q.search("summaryText", "budget").eq("org", "a"),
      )
      .take(10),
  );
  expect(filteredResults).toMatchObject([
    { org: "a", summaryText: "budget review" },
  ]);
});

test.each([null, 123])(
  "text search skips non-string search value %j",
  async (value) => {
    const schema = defineSchema({
      docs: defineTable({
        summaryText: v.union(v.string(), v.null(), v.number()),
      }).searchIndex("search_summary", { searchField: "summaryText" }),
    });
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("docs", { summaryText: value });
      await ctx.db.insert("docs", { summaryText: "123 null" });
    });

    const results = await t.run(async (ctx) =>
      ctx.db
        .query("docs")
        .withSearchIndex("search_summary", (q) =>
          q.search("summaryText", String(value)),
        )
        .take(10),
    );
    expect(results).toMatchObject([{ summaryText: "123 null" }]);
  },
);

test("text search", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello convex" });
    await ctx.db.insert("messages", { author: "michal", body: "hello next" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello base" });
  });
  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "hello",
      author: null,
    });
    expect(messages).toMatchObject([
      { author: "sarah", body: "hello convex" },
      { author: "michal", body: "hello next" },
      { author: "sarah", body: "hello base" },
    ]);
  }
  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "hello",
      author: "sarah",
    });
    expect(messages).toMatchObject([
      { author: "sarah", body: "hello convex" },
      { author: "sarah", body: "hello base" },
    ]);
  }
  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "con",
      author: null,
    });
    expect(messages).toMatchObject([{ author: "sarah", body: "hello convex" }]);
  }
});

test("case insensitive text search", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "alice", body: "Hello World" });
    await ctx.db.insert("messages", { author: "bob", body: "GOODBYE WORLD" });
    await ctx.db.insert("messages", {
      author: "charlie",
      body: "Mixed Case Text",
    });
    await ctx.db.insert("messages", {
      author: "diana",
      body: "lowercase text",
    });
  });

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "HELLO",
      author: null,
    });
    expect(messages).toMatchObject([{ author: "alice", body: "Hello World" }]);
  }

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "goodbye",
      author: null,
    });
    expect(messages).toMatchObject([{ author: "bob", body: "GOODBYE WORLD" }]);
  }

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "WoRlD",
      author: null,
    });
    expect(messages).toMatchObject([
      { author: "alice", body: "Hello World" },
      { author: "bob", body: "GOODBYE WORLD" },
    ]);
  }

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "TEX",
      author: null,
    });
    expect(messages).toMatchObject([
      { author: "charlie", body: "Mixed Case Text" },
      { author: "diana", body: "lowercase text" },
    ]);
  }

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "TEXT",
      author: "charlie",
    });
    expect(messages).toMatchObject([
      { author: "charlie", body: "Mixed Case Text" },
    ]);
  }
});

test("multi-word query matching", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "alice", body: "Foo Bar Baz" });
    await ctx.db.insert("messages", { author: "bob", body: "Hello World" });
    await ctx.db.insert("messages", { author: "charlie", body: "Foo" });
    await ctx.db.insert("messages", { author: "diana", body: "Bar" });
    await ctx.db.insert("messages", { author: "eve", body: "Something Else" });
  });

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "foo bar",
      author: null,
    });
    expect(messages).toMatchObject([
      { author: "alice", body: "Foo Bar Baz" },
      { author: "charlie", body: "Foo" },
      { author: "diana", body: "Bar" },
    ]);
  }

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "hello world",
      author: null,
    });
    expect(messages).toMatchObject([{ author: "bob", body: "Hello World" }]);
  }

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "foo baz",
      author: null,
    });
    expect(messages).toMatchObject([
      { author: "alice", body: "Foo Bar Baz" },
      { author: "charlie", body: "Foo" },
    ]);
  }

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "foo missing",
      author: null,
    });
    expect(messages).toMatchObject([
      { author: "alice", body: "Foo Bar Baz" },
      { author: "charlie", body: "Foo" },
    ]);
  }

  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "   foo   bar   ",
      author: null,
    });
    expect(messages).toMatchObject([
      { author: "alice", body: "Foo Bar Baz" },
      { author: "charlie", body: "Foo" },
      { author: "diana", body: "Bar" },
    ]);
  }
});
