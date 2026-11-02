import { expect, test } from "vitest";
import { convexTest } from "../index";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

function blob(size: number) {
  return new Blob([new Uint8Array(size)]);
}

test("default limits apply when enabled", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  await expect(
    t.mutation(async (ctx) => {
      for (let i = 0; i < 11; i++) {
        await ctx.storage.store(blob(1));
      }
    }),
  ).rejects.toThrow(/Too many files stored by this mutation \(limit: 10\)/);
});

test("filesWritten limit", async () => {
  const t = convexTest({ schema, transactionLimits: { filesWritten: 2 } });
  await t.mutation(async (ctx) => {
    await ctx.storage.store(blob(1));
    await ctx.storage.store(blob(1));
  });
  await expect(
    t.mutation(async (ctx) => {
      for (let i = 0; i < 3; i++) {
        await ctx.storage.store(blob(1));
      }
    }),
  ).rejects.toThrow(/Too many files stored by this mutation \(limit: 2\)/);
  expect(await t.query(internal.storage.listFiles)).toHaveLength(2);
});

test("fileWriteBytes limit", async () => {
  const t = convexTest({ schema, transactionLimits: { fileWriteBytes: 10 } });
  await t.mutation(async (ctx) => {
    await ctx.storage.store(blob(4));
    await ctx.storage.store(blob(6));
  });
  await expect(
    t.mutation(async (ctx) => {
      await ctx.storage.store(blob(10));
      await ctx.storage.store(blob(1));
    }),
  ).rejects.toThrow(
    /Too large total size of the files stored by this mutation \(limit: 10 bytes\)/,
  );
});

test("storing a file over the limit doesn't count toward usage", async () => {
  const t = convexTest({ schema, transactionLimits: { fileWriteBytes: 10 } });
  const metrics = await t.mutation(async (ctx) => {
    await ctx.storage.store(blob(4));
    await expect(ctx.storage.store(blob(7))).rejects.toThrow(/Too large/);
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.filesWritten).toEqual({ used: 1, remaining: 9 });
  expect(metrics.fileWriteBytes).toEqual({ used: 4, remaining: 6 });
});

test("deleting a file stored by the mutation gives back its budget", async () => {
  const t = convexTest({ schema, transactionLimits: { filesWritten: 1 } });
  const metrics = await t.mutation(async (ctx) => {
    const id = await ctx.storage.store(blob(3));
    await ctx.storage.delete(id);
    await ctx.storage.store(blob(5));
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.filesWritten.used).toEqual(1);
  expect(metrics.fileWriteBytes.used).toEqual(5);
  expect(await t.query(internal.storage.listFiles)).toHaveLength(1);
});

test("deleting an existing file doesn't give back budget", async () => {
  const t = convexTest({ schema, transactionLimits: { filesWritten: 1 } });
  const existingId = await t.mutation(internal.storage.mutationStoreBlob, {
    bytes: new Uint8Array([1]).buffer,
  });
  await expect(
    t.mutation(async (ctx) => {
      await ctx.storage.delete(existingId);
      await ctx.storage.store(blob(1));
      await ctx.storage.store(blob(1));
    }),
  ).rejects.toThrow(/Too many files stored by this mutation/);
});

test("transactionLimits for files written are enforced in nested mutations", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(async (ctx) => {
      await ctx.storage.store(blob(1));
      await ctx.runMutation(
        internal.storage.mutationStoreBlob,
        { bytes: new Uint8Array(5).buffer },
        { transactionLimits: { fileWriteBytes: 4 } },
      );
    }),
  ).rejects.toThrow(
    /Too large total size of the files stored by this mutation \(limit: 5 bytes\)/,
  );
});

async function storeFiles(
  t: ReturnType<typeof convexTest>,
  sizes: number[],
): Promise<Id<"_storage">[]> {
  const ids = [];
  for (const size of sizes) {
    ids.push(
      await t.mutation(internal.storage.mutationStoreBlob, {
        bytes: new Uint8Array(size).buffer,
      }),
    );
  }
  return ids;
}

test("filesRead limit", async () => {
  const t = convexTest({ schema, transactionLimits: { filesRead: 2 } });
  const ids = await storeFiles(t, [1, 1, 1]);
  await t.mutation(async (ctx) => {
    await ctx.storage.get(ids[0]);
    await ctx.storage.get(ids[1]);
  });
  await expect(
    t.mutation(async (ctx) => {
      for (const id of ids) {
        await ctx.storage.get(id);
      }
    }),
  ).rejects.toThrow(/Too many files read by this mutation \(limit: 2\)/);
});

test("fileReadBytes limit", async () => {
  const t = convexTest({ schema, transactionLimits: { fileReadBytes: 10 } });
  const ids = await storeFiles(t, [5, 6]);
  await expect(
    t.mutation(async (ctx) => {
      await ctx.storage.get(ids[0]);
      await ctx.storage.get(ids[1]);
    }),
  ).rejects.toThrow(
    /Too large total size of the files read by this mutation \(limit: 10 bytes\)/,
  );
});

test("reading the same file repeatedly counts once", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  const [id] = await storeFiles(t, [4]);
  const metrics = await t.mutation(async (ctx) => {
    for (let i = 0; i < 3; i++) {
      await ctx.storage.get(id);
    }
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.filesRead).toEqual({ used: 1, remaining: 9 });
  expect(metrics.fileReadBytes).toEqual({ used: 4, remaining: (1 << 24) - 4 });
});

test("a file read by the parent and a nested mutation counts once", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  const [id] = await storeFiles(t, [4]);
  const metrics = await t.mutation(async (ctx) => {
    await ctx.storage.get(id);
    await ctx.runMutation(internal.storage.mutationGetBlob, { id });
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.filesRead.used).toEqual(1);
  expect(metrics.fileReadBytes.used).toEqual(4);
});

test("files read by a rolled-back nested mutation still count", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  const [id] = await storeFiles(t, [4]);
  const metrics = await t.mutation(async (ctx) => {
    await expect(
      ctx.runMutation(internal.storage.mutationGetBlobThenThrow, { id }),
    ).rejects.toThrow("rollback");
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.filesRead.used).toEqual(1);
  expect(metrics.fileReadBytes.used).toEqual(4);
});

test("reading a file stored by the same mutation doesn't count", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  const metrics = await t.mutation(async (ctx) => {
    const id = await ctx.storage.store(blob(4));
    expect(await ctx.storage.get(id)).not.toBeNull();
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.filesRead.used).toEqual(0);
  expect(metrics.fileReadBytes.used).toEqual(0);
});

test("reading a missing file doesn't count", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  const [id] = await storeFiles(t, [4]);
  await t.mutation(internal.storage.mutationDeleteBlob, { id });
  const metrics = await t.mutation(async (ctx) => {
    expect(await ctx.storage.get(id)).toBeNull();
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.filesRead.used).toEqual(0);
});

async function storeAndDeleteInNestedMutation(rollbackNested: boolean) {
  const t = convexTest({ schema, transactionLimits: true });
  const parentBytes = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
  const childBytes = new Uint8Array([7, 8, 9, 10, 11]).buffer;
  const result = await t.mutation(async (ctx) => {
    const parentId = await ctx.storage.store(new Blob([parentBytes]));
    let childId: Id<"_storage"> | null = null;
    try {
      childId = await ctx.runMutation(
        internal.storage.mutationStoreBlobAndDeleteOther,
        { bytes: childBytes, deleteId: parentId, fail: rollbackNested },
      );
    } catch (e) {
      expect((e as Error).message).toMatch("rollback");
    }
    return {
      parentId,
      childId,
      metrics: await ctx.meta.getTransactionMetrics(),
    };
  });
  const files = await t.query(internal.storage.listFiles);
  return { t, parentBytes, childBytes, files, ...result };
}

test("nested mutation stores a file and deletes the parent's", async () => {
  const { t, childBytes, files, childId, metrics } =
    await storeAndDeleteInNestedMutation(false);
  expect(files.map((f) => f._id)).toEqual([childId]);
  expect(metrics.filesWritten.used).toEqual(1);
  expect(metrics.fileWriteBytes.used).toEqual(childBytes.byteLength);
  expect(
    await t.mutation(internal.storage.mutationGetBlob, { id: childId! }),
  ).toMatchObject({ bytes: childBytes });
});

test("rolled-back nested mutation restores the parent's file", async () => {
  const { t, parentBytes, files, parentId, childId, metrics } =
    await storeAndDeleteInNestedMutation(true);
  expect(childId).toBeNull();
  expect(files.map((f) => f._id)).toEqual([parentId]);
  expect(metrics.filesWritten.used).toEqual(1);
  expect(metrics.fileWriteBytes.used).toEqual(parentBytes.byteLength);
  expect(
    await t.mutation(internal.storage.mutationGetBlob, { id: parentId }),
  ).toMatchObject({ bytes: parentBytes });
});

test("a failed read over the limit doesn't count", async () => {
  const t = convexTest({ schema, transactionLimits: { filesRead: 1 } });
  const ids = await storeFiles(t, [1, 1]);
  const metrics = await t.mutation(async (ctx) => {
    await ctx.storage.get(ids[0]);
    for (let i = 0; i < 2; i++) {
      await expect(ctx.storage.get(ids[1])).rejects.toThrow(
        /Too many files read by this mutation/,
      );
    }
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.filesRead.used).toEqual(1);
});
