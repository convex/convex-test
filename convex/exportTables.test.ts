import { convexTest } from "../index";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { expect, test, vi } from "vitest";

test("instances share each table's exported validator and indexes", async () => {
  const schema = defineSchema({
    users: defineTable({ name: v.string() }).index("by_name", ["name"]),
    posts: defineTable({ title: v.string() }),
  });
  const exports = Object.values(schema.tables).map((table) =>
    vi.spyOn(table as any, "export"),
  );

  // Several instances of one schema, as a test file makes one per test.
  const instances = Array.from({ length: 3 }, () => convexTest(schema));

  // Each table is exported once, not once per instance.
  for (const spy of exports) {
    expect(spy).toHaveBeenCalledTimes(1);
  }
  // And each instance still validates and indexes against it.
  for (const t of instances) {
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { name: "a" });
      const found = await ctx.db
        .query("users")
        .withIndex("by_name", (q) => q.eq("name", "a"))
        .collect();
      expect(found).toHaveLength(1);
      await expect(
        ctx.db.insert("users", { name: 1 as unknown as string }),
      ).rejects.toThrow();
    });
  }
});
