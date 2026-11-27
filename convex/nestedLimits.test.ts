import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

const MiB = 1 << 20;

async function seed(t: ReturnType<typeof convexTest>, count: number) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("messages", { author: "sarah", body: `msg${i}` });
    }
  });
}

test("nested runQuery enforces its own documentsRead limit", async () => {
  const t = convexTest({ schema });
  await seed(t, 10);
  // Global limits are disabled, but the nested call explicitly asks for a
  // tight limit, so it should be enforced.
  await expect(
    t.query(api.nestedLimits.parentReadWithLimits, {
      transactionLimits: { documentsRead: 5 },
    }),
  ).rejects.toThrow(/Scanned too many documents/);
});

test("nested runQuery under its limit succeeds", async () => {
  const t = convexTest({ schema });
  await seed(t, 3);
  const count = await t.query(api.nestedLimits.parentReadWithLimits, {
    transactionLimits: { documentsRead: 5 },
  });
  expect(count).toBe(3);
});

test("nested runMutation enforces its own documentsWritten limit", async () => {
  const t = convexTest({ schema });
  await expect(
    t.mutation(api.nestedLimits.parentInsertWithLimits, {
      count: 10,
      transactionLimits: { documentsWritten: 3 },
    }),
  ).rejects.toThrow(/Wrote too many documents/);
});

test("nested runMutation under its limit succeeds", async () => {
  const t = convexTest({ schema });
  await t.mutation(api.nestedLimits.parentInsertWithLimits, {
    count: 2,
    transactionLimits: { documentsWritten: 5 },
  });
  const count = await t.query(api.nestedLimits.readAll, {});
  expect(count).toBe(2);
});

test("nested limits cannot raise above the global limit", async () => {
  const t = convexTest({
    schema,
    transactionLimits: { documentsRead: 5 },
  });
  await seed(t, 10);
  // The nested call asks for documentsRead: 100000, but it is capped at the
  // global limit of 5, so reading 10 docs still throws.
  await expect(
    t.query(api.nestedLimits.parentReadWithLimits, {
      transactionLimits: { documentsRead: 100000 },
    }),
  ).rejects.toThrow(/Scanned too many documents/);
});

test("global limit still applies when the nested limit is looser", async () => {
  const t = convexTest({
    schema,
    transactionLimits: { documentsRead: 5 },
  });
  await seed(t, 10);
  // Nested limit (8) is looser, but the global limit (5) is the binding
  // constraint and is enforced too.
  await expect(
    t.query(api.nestedLimits.parentReadWithLimits, {
      transactionLimits: { documentsRead: 8 },
    }),
  ).rejects.toThrow(/Scanned too many documents/);
});

test("nested limit does not leak to the parent transaction", async () => {
  const t = convexTest({
    schema,
    // Generous global limit so only the nested scope is restrictive.
    transactionLimits: { documentsRead: 100, bytesRead: 16 * MiB },
  });
  await seed(t, 10);
  // The nested query reads 2 docs under a tight limit of 3 (ok). After it
  // returns, the parent reads all 10 docs itself. If the nested limit leaked,
  // this would throw; under the global limit of 100 it succeeds.
  const count = await t.query(api.nestedLimits.nestThenReadAll, {
    nestedReadCount: 2,
    transactionLimits: { documentsRead: 3 },
  });
  expect(count).toBe(10);
});

test("rolled-back nested writes are not counted against the transaction", async () => {
  const t = convexTest({ schema });
  // The nested mutation writes 5 docs then throws, so its writes roll back.
  // The parent swallows the error and reads back the transaction metrics: the
  // rolled-back writes should not be counted.
  const documentsWritten = await t.mutation(
    api.nestedLimits.insertRollbackThenReportMetrics,
    { count: 5 },
  );
  expect(documentsWritten).toBe(0);
  // And nothing was actually persisted.
  const count = await t.query(api.nestedLimits.readAll, {});
  expect(count).toBe(0);
});

test("rolled-back nested writes do not consume the global write limit", async () => {
  const t = convexTest({
    schema,
    transactionLimits: { documentsWritten: 5 },
  });
  // Nested mutation writes 4 docs then throws (rolled back). Afterwards the
  // parent can still write 4 docs of its own: if the rolled-back writes had
  // been counted, 4 + 4 would exceed the limit of 5.
  await t.mutation(api.nestedLimits.parentInsertAfterRollback, {
    rolledBackCount: 4,
    keptCount: 4,
  });
  const count = await t.query(api.nestedLimits.readAll, {});
  expect(count).toBe(4);
});

test("nested transactionLimits is optional", async () => {
  const t = convexTest({ schema });
  await seed(t, 10);
  const count = await t.query(api.nestedLimits.parentReadNoLimits, {});
  expect(count).toBe(10);
});

test("a nested query reading the parent's range counts no new index range", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  expect(
    await t.query(api.nestedLimits.readAllTwiceThenReportQueries, {}),
  ).toBe(1);
});
