import { expect, test } from "vitest";
import { convexTest } from "../index";

test("storage: ctx.storage.getMetadata returns the file's metadata", async () => {
  const t = convexTest();
  const storageId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob(["hello"], { type: "text/plain" })),
  );
  const metadata = await t.query(async (ctx) =>
    ctx.storage.getMetadata(storageId),
  );

  expect(metadata).toMatchObject({
    size: 5,
    contentType: "text/plain",
    sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  });
});

test("storage: ctx.storage.store in an action checks the sha256 option", async () => {
  const t = convexTest();
  const wrongSha256 = btoa("not the right digest, 32 bytes!!");
  await expect(
    t.action(async (ctx) =>
      ctx.storage.store(new Blob(["hello"]), { sha256: wrongSha256 }),
    ),
  ).rejects.toThrow(/Sha256 mismatch/);
});
