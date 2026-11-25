import { expect, test } from "vitest";
import { getDocumentSize } from "convex/values";
import { convexTest } from "../index";
import schema from "./schema";

test("default: limits disabled, no throws", async () => {
  const t = convexTest({ schema });
  // Insert many docs without hitting limits (default is disabled)
  await t.run(async (ctx) => {
    for (let i = 0; i < 100; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: "x".repeat(1000),
      });
    }
  });
  // Read them all back
  const result = await t.query(async (ctx) => {
    return await ctx.db.query("messages").collect();
  });
  expect(result.length).toEqual(100);
});

test("read byte limit exceeded throws", async () => {
  const t = convexTest({
    schema,
    transactionLimits: {
      bytesRead: 500,
      documentsRead: 100000,
      databaseQueries: 100,
    },
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: "x".repeat(200),
      });
    }
  });
  await expect(
    t.query(async (ctx) => {
      return await ctx.db.query("messages").collect();
    }),
  ).rejects.toThrow(/Read too much data/);
});

const MiB = 1 << 20;

test("read document limit exceeded throws", async () => {
  const t = convexTest({
    schema,
    transactionLimits: {
      bytesRead: 16 * MiB,
      documentsRead: 5,
      databaseQueries: 100,
    },
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", { author: "sarah", body: `msg${i}` });
    }
  });
  await expect(
    t.query(async (ctx) => {
      return await ctx.db.query("messages").collect();
    }),
  ).rejects.toThrow(/Scanned too many documents/);
});

test("write byte limit exceeded throws", async () => {
  const t = convexTest({
    schema,
    transactionLimits: {
      bytesWritten: 500,
      documentsWritten: 100000,
    },
  });
  await expect(
    t.mutation(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("messages", {
          author: "sarah",
          body: "x".repeat(200),
        });
      }
    }),
  ).rejects.toThrow(/Wrote too much data/);
});

test("write document limit exceeded throws", async () => {
  const t = convexTest({
    schema,
    transactionLimits: {
      bytesWritten: 16 * MiB,
      documentsWritten: 3,
    },
  });
  await expect(
    t.mutation(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("messages", { author: "sarah", body: `msg${i}` });
      }
    }),
  ).rejects.toThrow(/Wrote too many documents/);
});

test("index range limit exceeded throws", async () => {
  const t = convexTest({
    schema,
    transactionLimits: {
      bytesRead: 16 * MiB,
      documentsRead: 100000,
      databaseQueries: 2,
    },
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
    await ctx.db.insert("messages", { author: "sarah", body: "world" });
  });
  await expect(
    t.query(async (ctx) => {
      // Each db.get of a different document counts as one index range read
      const docs = await ctx.db.query("messages").collect();
      await ctx.db.get(docs[0]._id);
      await ctx.db.get(docs[1]._id);
      // The query itself used one range, plus two gets = 3 total, limit is 2
    }),
  ).rejects.toThrow(/Too many index ranges/);
});

test("reading the same document again does not count another index range", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  const id = await t.run(async (ctx) => {
    return await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  const metrics = await t.query(async (ctx) => {
    // More gets than the 4,096 index range limit, all of the same document
    for (let i = 0; i < 5000; i++) {
      await ctx.db.get(id);
    }
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.databaseQueries.used).toBe(1);
  // Every read still counts toward the document and byte limits
  expect(metrics.documentsRead.used).toBe(5000);
});

test("running the same query again does not count another index range", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  await t.run(async (ctx) => {
    for (let i = 0; i < 3; i++) {
      await ctx.db.insert("messages", { author: "sarah", body: `msg${i}` });
    }
  });
  const used = await t.query(async (ctx) => {
    for (let i = 0; i < 5000; i++) {
      await ctx.db
        .query("messages")
        .withIndex("author", (q) => q.eq("author", "sarah"))
        .first();
    }
    // Reading more or fewer rows reads part of the same range
    await ctx.db
      .query("messages")
      .withIndex("author", (q) => q.eq("author", "sarah"))
      .collect();
    await ctx.db
      .query("messages")
      .withIndex("author", (q) => q.eq("author", "sarah"))
      .take(2);
    return (await ctx.meta.getTransactionMetrics()).databaseQueries.used;
  });
  expect(used).toBe(1);
});

test("different index ranges each count once", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "a" });
    await ctx.db.insert("messages", { author: "michal", body: "b" });
  });
  const used = await t.query(async (ctx) => {
    for (const author of ["sarah", "michal", "sarah", "michal"]) {
      await ctx.db
        .query("messages")
        .withIndex("author", (q) => q.eq("author", author))
        .first();
    }
    // The first and last rows of a table are different ranges
    await ctx.db.query("messages").order("asc").first();
    await ctx.db.query("messages").order("desc").first();
    return (await ctx.meta.getTransactionMetrics()).databaseQueries.used;
  });
  expect(used).toBe(4);
});

test("a page counts the range it starts, once", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  await t.run(async (ctx) => {
    for (let i = 0; i < 3; i++) {
      await ctx.db.insert("messages", { author: "sarah", body: `msg${i}` });
    }
  });
  const used = await t.mutation(async (ctx) => {
    // A stream and a first page start at the same place
    await ctx.db.query("messages").first();
    const first = await ctx.db
      .query("messages")
      .paginate({ cursor: null, numItems: 1 });
    await ctx.db.query("messages").paginate({ cursor: null, numItems: 2 });
    await ctx.db
      .query("messages")
      .paginate({ cursor: first.continueCursor, numItems: 1 });
    return (await ctx.meta.getTransactionMetrics()).databaseQueries.used;
  });
  expect(used).toBe(2);
});

test("each transaction starts with no index ranges read", async () => {
  const t = convexTest({ schema, transactionLimits: true });
  const id = await t.run(async (ctx) => {
    return await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  for (let i = 0; i < 2; i++) {
    const used = await t.query(async (ctx) => {
      await ctx.db.get(id);
      return (await ctx.meta.getTransactionMetrics()).databaseQueries.used;
    });
    expect(used).toBe(1);
  }
});

test("limits accumulate within a transaction", async () => {
  const t = convexTest({
    schema,
    transactionLimits: {
      bytesRead: 16 * MiB,
      documentsRead: 5,
      databaseQueries: 2,
    },
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", { author: "sarah", body: `msg${i}` });
    }
  });
  // A mutation that reads more docs than the limit
  await expect(
    t.mutation(async (ctx) => {
      // Reading 10 docs exceeds the limit of 5
      return await ctx.db.query("messages").collect();
    }),
  ).rejects.toThrow(/Scanned too many documents/);
});

test("getTransactionMetrics returns bandwidth stats", async () => {
  const t = convexTest({ schema });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
    await ctx.db.insert("messages", { author: "michal", body: "world" });
  });
  const { consumption, totalBytes } = await t.query(async (ctx) => {
    const docs = await ctx.db.query("messages").collect();
    const totalBytes = docs.reduce((sum, doc) => sum + getDocumentSize(doc), 0);
    const consumption = await ctx.meta.getTransactionMetrics();
    return { consumption, totalBytes };
  });
  expect(consumption.documentsRead.used).toBe(2);
  expect(consumption.bytesRead.used).toBe(totalBytes);
  expect(consumption.databaseQueries.used).toBe(1);
  expect(consumption.documentsRead.remaining).toBe(32000 - 2);
  expect(consumption.bytesRead.remaining).toBe((16 << 20) - totalBytes);
  expect(consumption.bytesWritten.used).toBe(0);
  expect(consumption.documentsWritten.used).toBe(0);
  expect(consumption.functionsScheduled.used).toBe(0);
  expect(consumption.scheduledFunctionArgsBytes.used).toBe(0);
});

test("getTransactionMetrics tracks writes", async () => {
  const t = convexTest({ schema });
  const { consumption, docBytes } = await t.mutation(async (ctx) => {
    const id = await ctx.db.insert("messages", {
      author: "sarah",
      body: "hello",
    });
    const doc = (await ctx.db.get(id))!;
    const docBytes = getDocumentSize(doc);
    const consumption = await ctx.meta.getTransactionMetrics();
    return { consumption, docBytes };
  });
  expect(consumption.documentsWritten.used).toBe(1);
  expect(consumption.bytesWritten.used).toBe(docBytes);
});
