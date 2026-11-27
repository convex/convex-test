import { expect, test } from "vitest";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "../index";

const schema = defineSchema({
  posts: defineTable({ body: v.string(), org: v.string() }).searchIndex(
    "search_body",
    { searchField: "body", filterFields: ["org"] },
  ),
});

async function search(bodies: string[], query: string) {
  const t = convexTest(schema);
  return await t.run(async (ctx) => {
    for (const body of bodies) {
      await ctx.db.insert("posts", { body, org: "a" });
    }
    const results = await ctx.db
      .query("posts")
      .withSearchIndex("search_body", (q) => q.search("body", query))
      .collect();
    return results.map((post) => post.body).sort();
  });
}

test("search: punctuation separates words", async () => {
  expect(await search(["hello,world", "state-of-the-art"], "world")).toEqual([
    "hello,world",
  ]);
  expect(await search(["hello,world", "state-of-the-art"], "art")).toEqual([
    "state-of-the-art",
  ]);
});

test("search: a query word followed by punctuation still matches", async () => {
  expect(await search(["hello there"], "hello,")).toEqual(["hello there"]);
});

test("search: only the last query term is a prefix match", async () => {
  expect(await search(["hello"], "hel world")).toEqual([]);
});

test("search: tokens of 32 or more bytes are ignored", async () => {
  const long = "a".repeat(40);
  expect(await search([long], long)).toEqual([]);
});

test("search: only the first 16 query terms are used", async () => {
  const words = Array.from({ length: 16 }, (_, i) => `filler${i}`).join(" ");
  expect(await search(["needle"], `${words} needle`)).toEqual([]);
});
