import { expect, test } from "vitest";
import { convexTest } from "../index";

test("writes: db.get throws on a malformed ID", async () => {
  const t = convexTest();
  await expect(
    t.run(async (ctx: any) => ctx.db.get("not-an-id")),
  ).rejects.toThrow(/Unable to decode ID/);
});

test("writes: db.get can't read a system table without db.system", async () => {
  const t = convexTest();
  await expect(
    t.run(async (ctx: any) => {
      const storageId = await ctx.storage.store(new Blob(["x"]));
      return await ctx.db.get(storageId);
    }),
  ).rejects.toThrow(/System tables can only be accessed with db.system/);
});

test("writes: db.delete can't delete a _storage document", async () => {
  const t = convexTest();
  await expect(
    t.run(async (ctx: any) => {
      const storageId = await ctx.storage.store(new Blob(["x"]));
      await ctx.db.delete(storageId);
    }),
  ).rejects.toThrow(/System tables can only be accessed with db.system/);
});
