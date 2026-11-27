/// <reference types="vite/client" />

import { afterEach, expect, test, vi } from "vitest";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "../index";
import { api, components } from "./_generated/api";
import { QueryCtx } from "./_generated/server";
import { getSnapshotTs } from "./getSnapshotTs";
import schema from "./schema";
import counterSchema from "./counter/component/schema";

const counterModules = import.meta.glob("./counter/component/**/*.ts");
const now = 1_750_000_000_000;

function expectBigint(value: unknown): bigint {
  if (typeof value !== "bigint") {
    expect.fail(`expected a bigint, got ${typeof value}`);
  }
  return value;
}

afterEach(() => {
  vi.useRealTimers();
});

test.each(["query", "mutation", "run"] as const)(
  "%s returns a synchronous bigint snapshot in Unix nanoseconds",
  async (type) => {
    vi.useFakeTimers({ now });
    const t = convexTest(schema);
    const handler = async () => {
      const ts = getSnapshotTs();
      expect(typeof ts).toBe("bigint");
      return ts;
    };
    const snapshotTs = await (type === "query"
      ? t.query(handler)
      : type === "mutation"
        ? t.mutation(handler)
        : t.run(handler));
    expect(snapshotTs).toBe(BigInt(now) * 1_000_000n);
  },
);

test.each(["query", "mutation"] as const)(
  "%s captures its snapshot at transaction start and keeps it stable",
  async (type) => {
    vi.useFakeTimers({ now });
    const t = convexTest(schema);
    const commitTs = expectBigint(
      await t.mutation(async (ctx) => ctx.db.vars.commitTs),
    );
    vi.setSystemTime(now + 500);
    const handler = async (ctx: QueryCtx) => {
      // Advancing time before the first syscall must not change the snapshot.
      vi.setSystemTime(now + 1000);
      const snapshotTs = getSnapshotTs();
      expect(snapshotTs).toBe(BigInt(now + 500) * 1_000_000n);
      expect(snapshotTs).toBeGreaterThan(commitTs);
      await ctx.db.query("commitTs").first();
      vi.setSystemTime(now + 2000);
      expect(getSnapshotTs()).toBe(snapshotTs);
    };
    if (type === "query") {
      await t.query(handler);
    } else {
      await t.mutation(handler);
    }
  },
);

test("an empty database samples the clock when its first query starts", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  vi.advanceTimersByTime(1000);
  expect(await t.query(api.getSnapshotTs.snapshotQuery)).toBe(
    BigInt(now + 1000) * 1_000_000n,
  );
});

test("new query snapshots advance with fake time without an intervening mutation", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  await t.run(async () => {});
  const before = await t.query(api.getSnapshotTs.snapshotQuery);
  vi.advanceTimersByTime(1000);
  const after = await t.query(api.getSnapshotTs.snapshotQuery);
  expect(after).toBeGreaterThan(before);
  // The baseline commit can be nanoseconds ahead of the frozen wall clock.
  expect(after).toBe(BigInt(now + 1000) * 1_000_000n);
});

test("scheduled rows become due in a snapshot-bounded query as fake time advances", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(
    defineSchema({
      work: defineTable({ scheduledTs: v.int64() }).index("by_scheduled_ts", [
        "scheduledTs",
      ]),
    }),
  );
  const id = await t.mutation(async (ctx) =>
    ctx.db.insert("work", {
      scheduledTs: BigInt(Date.now() + 1000) * 1_000_000n,
    }),
  );
  const dueWork = () =>
    t.query(async (ctx) => {
      const snapshotTs = getSnapshotTs();
      return await ctx.db
        .query("work")
        .withIndex("by_scheduled_ts", (q) => q.lte("scheduledTs", snapshotTs))
        .take(10);
    });
  expect(await dueWork()).toEqual([]);
  vi.advanceTimersByTime(999);
  expect(await dueWork()).toEqual([]);
  vi.advanceTimersByTime(1);
  expect((await dueWork()).map((row) => row._id)).toEqual([id]);
});

test("the commit timestamp is assigned at the end of the transaction", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  const previousCommit = await t.mutation(async (ctx) => ctx.db.vars.commitTs);
  const result = await t.mutation(async (ctx) => {
    const snapshotTs = getSnapshotTs();
    vi.setSystemTime(now + 1000);
    return { snapshotTs, commitTs: ctx.db.vars.commitTs };
  });
  expect(result.snapshotTs).toBe(previousCommit);
  expect(result.commitTs).toBe(BigInt(now + 1000) * 1_000_000n);
  expect(await t.query(api.getSnapshotTs.snapshotQuery)).toBe(result.commitTs);
});

test.each([0, -1000])(
  "snapshots separate previous and future commits with clock delta %i ms",
  async (clockDelta) => {
    vi.useFakeTimers({ now });
    const t = convexTest(schema);
    let previousSnapshot = await t.query(api.getSnapshotTs.snapshotQuery);
    let previousCommit = 0n;
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(now + i * clockDelta);
      const { id, snapshotTs, commitTs } = await t.mutation(
        api.getSnapshotTs.snapshotMutation,
      );
      expect(typeof commitTs).toBe("bigint");
      expect(snapshotTs).toBeGreaterThanOrEqual(previousCommit);
      expect(snapshotTs).toBeGreaterThanOrEqual(previousSnapshot);
      expect(commitTs).toBeGreaterThan(snapshotTs);
      expect(commitTs).toBeGreaterThan(previousSnapshot);
      expect(commitTs).toBeGreaterThan(previousCommit);
      const doc = await t.query(api.commitTs.getDoc, { id });
      expect(doc!.commitTs).toBe(commitTs);
      // Both timestamps use nanoseconds, including the resolved placeholder.
      expect(commitTs).toBeGreaterThanOrEqual(BigInt(now) * 1_000_000n);
      expect(commitTs).toBeLessThan(BigInt(now + 1) * 1_000_000n);
      previousSnapshot = await t.query(api.getSnapshotTs.snapshotQuery);
      expect(previousSnapshot).toBe(commitTs);
      previousCommit = expectBigint(commitTs);
    }
  },
);

test.each([0, -2000])(
  "read-only snapshots bound future commits with clock delta %i ms",
  async (clockDelta) => {
    vi.useFakeTimers({ now });
    const t = convexTest(schema);
    const committed = await t.mutation(api.getSnapshotTs.snapshotMutation);
    vi.advanceTimersByTime(1000);
    const readSnapshot = await t.query(api.getSnapshotTs.snapshotQuery);
    expect(readSnapshot).toBe(BigInt(now + 1000) * 1_000_000n);
    expect(readSnapshot).toBeGreaterThan(expectBigint(committed.commitTs));
    for (const clockDelta of [1000, 0, -1000]) {
      vi.setSystemTime(now + clockDelta);
      expect(await t.query(api.getSnapshotTs.snapshotQuery)).toBe(readSnapshot);
    }
    expect(await t.query(api.commitTs.commitTsInIndexOrder)).toEqual([
      committed.commitTs,
    ]);
    vi.setSystemTime(now + 1000 + clockDelta);
    const result = await t.mutation(api.getSnapshotTs.snapshotMutation);
    expect(result.snapshotTs).toBe(readSnapshot);
    expect(result.commitTs).toBe(readSnapshot + 1n);
  },
);

test.each([
  ["query", 0],
  ["query", -2000],
  ["mutation", 0],
  ["mutation", -2000],
] as const)(
  "a failed %s publishes no writes but bounds future commits with clock delta %i ms",
  async (type, clockDelta) => {
    vi.useFakeTimers({ now });
    const t = convexTest(schema);
    const committed = await t.mutation(api.getSnapshotTs.snapshotMutation);
    vi.setSystemTime(now + 1000);
    let snapshotTs = 0n;
    const handler = async () => {
      snapshotTs = getSnapshotTs();
      throw new Error("rollback");
    };
    await expect(
      type === "query"
        ? t.query(handler)
        : t.mutation(async (ctx) => {
            await ctx.db.insert("commitTs", { commitTs: ctx.db.vars.commitTs });
            return await handler();
          }),
    ).rejects.toThrow("rollback");
    expect(snapshotTs).toBe(BigInt(now + 1000) * 1_000_000n);
    expect(snapshotTs).toBeGreaterThan(expectBigint(committed.commitTs));
    await expect(t.action(async () => getSnapshotTs())).rejects.toThrow(
      "getSnapshotTs() can only be called from a query or mutation",
    );
    vi.setSystemTime(now + 1000 + clockDelta);
    expect(await t.query(api.commitTs.commitTsInIndexOrder)).toEqual([
      committed.commitTs,
    ]);
    const result = await t.mutation(api.getSnapshotTs.snapshotMutation);
    expect(result.snapshotTs).toBe(snapshotTs);
    expect(result.commitTs).toBe(snapshotTs + 1n);
  },
);

test("nested queries, mutations, and stale snapshot queries share the outer snapshot", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  const result = await t.mutation(async (ctx) => {
    const snapshotTs = getSnapshotTs();
    vi.setSystemTime(now + 1000);
    expect(await ctx.runQuery(api.getSnapshotTs.snapshotQuery)).toBe(
      snapshotTs,
    );
    const nested = await ctx.runMutation(api.getSnapshotTs.snapshotMutation);
    expect(nested.snapshotTs).toBe(snapshotTs);
    expect(
      await ctx.runQuery(
        api.getSnapshotTs.snapshotQuery,
        {},
        { useStaleSnapshot: true },
      ),
    ).toBe(snapshotTs);
    await expect(ctx.runMutation(api.commitTs.insertThenThrow)).rejects.toThrow(
      "rollback",
    );
    expect(getSnapshotTs()).toBe(snapshotTs);
    return { snapshotTs, commitTs: ctx.db.vars.commitTs, nested };
  });
  expect(result.nested.commitTs).toBe(result.commitTs);
  expect(result.commitTs).toBeGreaterThan(result.snapshotTs);
  expect(
    (await t.query(api.commitTs.getDoc, { id: result.nested.id }))!.commitTs,
  ).toBe(result.commitTs);
});

test("nested queries share their parent query's snapshot", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  await t.query(async (ctx) => {
    const snapshotTs = getSnapshotTs();
    vi.setSystemTime(now + 1000);
    expect(await ctx.runQuery(api.getSnapshotTs.snapshotQuery)).toBe(
      snapshotTs,
    );
    expect(await ctx.runQuery(components.counter.public.snapshot)).toBe(
      snapshotTs,
    );
    expect(getSnapshotTs()).toBe(snapshotTs);
  });
});

test("component calls share the snapshot and commit clock", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  const result = await t.mutation(async (ctx) => {
    const snapshotTs = getSnapshotTs();
    vi.setSystemTime(now + 1000);
    expect(await ctx.runQuery(components.counter.public.snapshot)).toBe(
      snapshotTs,
    );
    await ctx.runMutation(components.counter.public.addWithCommitTs, {
      name: "snapshot",
    });
    expect(
      await ctx.runQuery(
        components.counter.public.snapshot,
        {},
        { useStaleSnapshot: true },
      ),
    ).toBe(snapshotTs);
    expect(getSnapshotTs()).toBe(snapshotTs);
    return { snapshotTs, commitTs: ctx.db.vars.commitTs };
  });
  expect(
    await t.query(components.counter.public.getCommitTs, { name: "snapshot" }),
  ).toBe(result.commitTs);
  expect(result.commitTs).toBeGreaterThan(result.snapshotTs);
  expect(await t.query(components.counter.public.snapshot)).toBe(
    result.commitTs,
  );
});

test("a queued query takes its snapshot after the preceding mutation commits", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  let started!: () => void;
  let release!: () => void;
  const mutationStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const mutationReleased = new Promise<void>((resolve) => {
    release = resolve;
  });
  const mutation = t.mutation(async (ctx) => {
    started();
    await mutationReleased;
    return ctx.db.vars.commitTs;
  });
  await mutationStarted;
  const query = t.query(async () => getSnapshotTs());
  vi.advanceTimersByTime(1000);
  release();
  const [commitTs, snapshotTs] = await Promise.all([mutation, query]);
  expect(snapshotTs).toBe(commitTs);
});

test("a queued query samples time after the preceding query finishes", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  let started!: () => void;
  let release!: () => void;
  const queryStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const queryReleased = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = t.query(async () => {
    started();
    await queryReleased;
    return getSnapshotTs();
  });
  await queryStarted;
  const second = t.query(async () => getSnapshotTs());
  vi.advanceTimersByTime(1000);
  release();
  expect(await first).toBe(BigInt(now) * 1_000_000n);
  expect(await second).toBe(BigInt(now + 1000) * 1_000_000n);
});

test("independent test instances have independent timestamp clocks", async () => {
  vi.useFakeTimers({ now });
  const first = convexTest(schema);
  const firstCommit = await first.mutation(async (ctx) => ctx.db.vars.commitTs);
  const firstSnapshot = await first.query(api.getSnapshotTs.snapshotQuery);
  expect(firstSnapshot).toBe(firstCommit);
  vi.setSystemTime(now - 1000);
  const second = convexTest(schema);
  expect(await second.query(api.getSnapshotTs.snapshotQuery)).toBe(
    BigInt(now - 1000) * 1_000_000n,
  );
  const secondCommit = await second.mutation(
    async (ctx) => ctx.db.vars.commitTs,
  );
  const secondSnapshot = await second.query(api.getSnapshotTs.snapshotQuery);
  expect(secondSnapshot).toBe(secondCommit);
  expect(secondSnapshot).toBe(BigInt(now - 1000) * 1_000_000n + 1n);
  expect(await first.query(api.getSnapshotTs.snapshotQuery)).toBe(
    firstSnapshot,
  );
});
