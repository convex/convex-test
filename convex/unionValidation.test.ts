import { expect, test } from "vitest";
import { convexTest } from "../index";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  events: defineTable({
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("paid"),
      v.null(),
    ),
    source: v.union(
      v.object({ kind: v.literal("company"), name: v.string() }),
      v.object({ kind: v.literal("contact"), contactId: v.id("contacts") }),
      v.object({ kind: v.optional(v.literal("legacy")), note: v.string() }),
    ),
    tags: v.optional(v.union(v.array(v.string()), v.string())),
  }),
  contacts: defineTable({ name: v.string() }),
});

test("union accepts the matching branch wherever it is", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    const contactId = await ctx.db.insert("contacts", { name: "Ann" });
    await ctx.db.insert("events", {
      status: "paid",
      source: { kind: "contact", contactId },
      tags: ["a"],
    });
    await ctx.db.insert("events", {
      status: null,
      source: { kind: "company", name: "Acme" },
      tags: "b",
    });
    // An optional literal discriminator may be absent.
    await ctx.db.insert("events", {
      status: "draft",
      source: { note: "old row" },
    });
    expect(await ctx.db.query("events").collect()).toHaveLength(3);
  });
});

test("union rejects a value no branch matches, with the same message", async () => {
  const t = convexTest(schema);
  await expect(
    t.run(async (ctx) => {
      await ctx.db.insert("events", {
        status: "void" as any,
        source: { kind: "company", name: "Acme" },
      });
    }),
  ).rejects.toThrowError(
    'Validator error: Expected one of literal, literal, literal, null, got `"void"`',
  );
  await expect(
    t.run(async (ctx) => {
      await ctx.db.insert("events", {
        status: "sent",
        // Right discriminator, wrong shape: still rejected.
        source: { kind: "company", contactId: "x" } as any,
      });
    }),
  ).rejects.toThrowError(
    "Validator error: Expected one of object, object, object",
  );
  await expect(
    t.run(async (ctx) => {
      await ctx.db.insert("events", {
        status: "sent",
        source: { kind: "contact", contactId: "1events" as any },
      });
    }),
  ).rejects.toThrowError(
    "Validator error: Expected one of object, object, object",
  );
});
