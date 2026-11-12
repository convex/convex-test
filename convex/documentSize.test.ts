import { expect, test } from "vitest";
import { convexTest } from "../index";
import { getDocumentSize } from "convex/values";
import schema from "./schema";

const MiB = 1 << 20;

// Each "🦊" is 4 bytes in UTF-8, so this string is 1 MiB on its own and the
// document is over the limit once the other fields are added. Its JavaScript
// length is only 524,288, which is why the size has to be measured in bytes.
const oversized = "🦊".repeat(MiB / 4);

test("insert rejects a document larger than 1 MiB", async () => {
  const t = convexTest(schema);
  await expect(
    t.run((ctx) =>
      ctx.db.insert("messages", { author: "sarah", body: oversized }),
    ),
  ).rejects.toThrow(/Value is too large/);
  expect(await t.run((ctx) => ctx.db.query("messages").collect())).toEqual([]);
});

test("insert accepts a document of exactly 1 MiB", async () => {
  const t = convexTest(schema);
  const id = await t.run((ctx) =>
    ctx.db.insert("messages", { author: "sarah", body: "" }),
  );
  const empty = await t.run((ctx) => ctx.db.get(id));
  // Fill the body so the stored document is exactly 1 MiB.
  const body = "a".repeat(MiB - getDocumentSize(empty!));
  await t.run((ctx) => ctx.db.insert("messages", { author: "sarah", body }));
  const docs = await t.run((ctx) => ctx.db.query("messages").collect());
  expect(getDocumentSize(docs[1])).toBe(MiB);
});

test("patch checks the merged document", async () => {
  const t = convexTest(schema);
  const half = "a".repeat(MiB / 2);
  const id = await t.run((ctx) =>
    ctx.db.insert("messages", { author: half, body: "" }),
  );
  // The patch on its own is under 1 MiB, but the merged document is not.
  await expect(
    t.run((ctx) => ctx.db.patch(id, { body: half })),
  ).rejects.toThrow(/Value is too large/);
  const doc = await t.run((ctx) => ctx.db.get(id));
  expect(doc!.body).toBe("");
});

test("replace checks the replacement, not the previous document", async () => {
  const t = convexTest(schema);
  const id = await t.run((ctx) =>
    ctx.db.insert("messages", { author: "sarah", body: "small" }),
  );
  await expect(
    t.run((ctx) => ctx.db.replace(id, { author: "sarah", body: oversized })),
  ).rejects.toThrow(/Value is too large/);
  const doc = await t.run((ctx) => ctx.db.get(id));
  expect(doc!.body).toBe("small");
});

test("a caught size error does not leave the write behind", async () => {
  const t = convexTest(schema);
  await t.mutation(async (ctx) => {
    try {
      await ctx.db.insert("messages", { author: "sarah", body: oversized });
    } catch {
      // ignored on purpose
    }
    await ctx.db.insert("messages", { author: "sarah", body: "ok" });
  });
  const docs = await t.run((ctx) => ctx.db.query("messages").collect());
  expect(docs.map((doc) => doc.body)).toEqual(["ok"]);
});
