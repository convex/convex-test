import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "../index";
import { api, internal } from "./_generated/api";
import { getSnapshotTs } from "./getSnapshotTs";
import schema from "./schema";

const now = 1_750_000_000_000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each(["query", "mutation", "run"] as const)(
  "%s pins Date at transaction start even as the wall clock moves",
  async (type) => {
    vi.useFakeTimers({ now });
    const t = convexTest(schema);
    const handler = async () => {
      expect(Date.now()).toBe(now);
      for (const delta of [1000, -1000]) {
        vi.setSystemTime(now + delta);
        await Promise.resolve();
        expect(Date.now()).toBe(now);
        expect(new Date().getTime()).toBe(now);
      }
    };
    if (type === "query") {
      await t.query(handler);
    } else if (type === "mutation") {
      await t.mutation(handler);
    } else {
      await t.run(handler);
    }
    expect(Date.now()).toBe(now - 1000);
  },
);

test.each([0, -1000])(
  "transaction time stays ahead of commits with clock delta %i ms",
  async (clockDelta) => {
    vi.useFakeTimers({ now });
    const t = convexTest(schema);
    // The second commit is one nanosecond ahead of the frozen wall clock.
    await t.mutation(async () => null);
    await t.mutation(async () => null);
    vi.setSystemTime(now + clockDelta);

    for (const type of ["query", "mutation", "run"] as const) {
      const handler = async () => {
        const snapshotTs = getSnapshotTs();
        const currentTime = Date.now();
        // Compare as bigints so rounding cannot hide a one-nanosecond skew.
        expect(BigInt(currentTime) * 1_000_000n).toBeGreaterThanOrEqual(
          snapshotTs,
        );
        expect(currentTime).toBe(now + 1);
        expect(new Date().getTime()).toBe(currentTime);
        await Promise.resolve();
        expect(Date.now()).toBe(currentTime);
      };
      if (type === "query") {
        await t.query(handler);
      } else if (type === "mutation") {
        await t.mutation(handler);
      } else {
        await t.run(handler);
      }
      expect(Date.now()).toBe(now + clockDelta);
      expect(new Date().getTime()).toBe(now + clockDelta);
    }

    await t.mutation(async (ctx) => {
      const currentTime = Date.now();
      expect(BigInt(currentTime) * 1_000_000n).toBeGreaterThanOrEqual(
        getSnapshotTs(),
      );
      let previousCreationTime = -Infinity;
      for (let i = 0; i < 3; i++) {
        const id = await ctx.db.insert("commitTs", {});
        const doc = (await ctx.db.get(id))!;
        expect(doc._creationTime).toBeGreaterThanOrEqual(currentTime);
        expect(doc._creationTime).toBeGreaterThan(previousCreationTime);
        previousCreationTime = doc._creationTime;
      }
    });
  },
);

test("transaction clocks are isolated from concurrent tests and actions", async () => {
  vi.useFakeTimers({ now });
  const first = convexTest(schema);
  await first.mutation(async () => null);
  await first.mutation(async () => null);
  vi.setSystemTime(now - 1000);
  const second = convexTest(schema);
  await second.mutation(async () => null);

  let started!: () => void;
  let release!: () => void;
  const queryStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const queryReleased = new Promise<void>((resolve) => {
    release = resolve;
  });
  const query = first.query(async () => {
    started();
    await queryReleased;
    return Date.now();
  });
  await queryStarted;
  try {
    expect(Date.now()).toBe(now - 1000);
    expect(await first.action(async () => Date.now())).toBe(now - 1000);
    expect(await second.query(async () => Date.now())).toBe(now - 1000);
    vi.setSystemTime(now + 1000);
    expect(await first.action(async () => Date.now())).toBe(now + 1000);
    expect(await second.query(async () => Date.now())).toBe(now + 1000);
  } finally {
    release();
  }
  expect(await query).toBe(now + 1);
});

test("a queued transaction pins its time after acquiring the lock", async () => {
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
    expect(Date.now()).toBe(now);
    return ctx.db.vars.commitTs;
  });
  await mutationStarted;
  const query = t.query(async () => ({
    time: Date.now(),
    snapshotTs: getSnapshotTs(),
  }));
  vi.setSystemTime(now + 1000);
  release();
  const [commitTs, result] = await Promise.all([mutation, query]);
  expect(result.time).toBe(now + 1000);
  expect(result.snapshotTs).toBe(commitTs);
  expect(BigInt(result.time) * 1_000_000n).toBeGreaterThanOrEqual(
    result.snapshotTs,
  );
});

test("nested mutations insert at or after the parent transaction's time", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  await t.mutation(async () => null);
  await t.mutation(async () => null);
  await t.mutation(async (ctx) => {
    const currentTime = Date.now();
    expect(currentTime).toBe(now + 1);
    vi.setSystemTime(now + 1000);
    expect(await ctx.runQuery(internal.globals.readTime)).toBe(currentTime);
    const id = await ctx.runMutation(api.commitTs.insertAndReadBack);
    const doc = await ctx.runQuery(api.commitTs.getDoc, { id });
    expect(doc!._creationTime).toBe(currentTime);
    expect(Date.now()).toBe(currentTime);
  });
});

test("nested transactions ignore a caller's Date replacement", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  const BaseDate = Date;
  const dateOverride = (time: number) =>
    new Proxy(BaseDate, {
      get(target, property, receiver) {
        return property === "now"
          ? () => time
          : Reflect.get(target, property, receiver);
      },
    });
  await t.action(async (ctx) => {
    globalThis.Date = dateOverride(now + 10_000);
    const id = await ctx.runMutation(api.commitTs.insertAndReadBack);
    const doc = await ctx.runQuery(api.commitTs.getDoc, { id });
    expect(doc!._creationTime).toBe(now);
    expect(doc!.commitTs).toBe(BigInt(now) * 1_000_000n);
    expect(Date.now()).toBe(now + 10_000);
  });
  await t.mutation(async (ctx) => {
    const currentTime = Date.now();
    globalThis.Date = dateOverride(now + 20_000);
    expect(await ctx.runQuery(internal.globals.readTime)).toBe(currentTime);
    expect(Date.now()).toBe(now + 20_000);
  });
  expect(Date).toBe(BaseDate);
});

test("Date keeps explicit arguments and static methods inside transactions", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  await t.mutation(async () => null);
  await t.mutation(async () => null);
  await t.query(async () => {
    const date = new Date();
    expect(date.getTime()).toBe(now + 1);
    expect(date).toBeInstanceOf(Date);
    expect(Date()).toBe(date.toString());
    expect(new Date(0).getTime()).toBe(0);
    expect(new Date("2024-01-01T00:00:00Z").getTime()).toBe(
      Date.UTC(2024, 0, 1),
    );
    expect(Date.parse("2024-01-01T00:00:00Z")).toBe(Date.UTC(2024, 0, 1));
  });
});

test("clock changes and rollbacks do not leak transaction time", async () => {
  const t = convexTest(schema);
  vi.useFakeTimers({ now });
  await t.mutation(async () => null);
  await t.mutation(async () => null);
  await expect(
    t.mutation(async () => {
      expect(Date.now()).toBe(now + 1);
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(Date.now()).toBe(now);
  vi.setSystemTime(now + 1000);
  expect(await t.query(async () => Date.now())).toBe(now + 1000);

  vi.useRealTimers();
  vi.useFakeTimers({ now: now - 1000 });
  expect(await t.query(async () => Date.now())).toBe(now + 1);
  expect(Date.now()).toBe(now - 1000);
});

test("Date.now can be mocked before and after a transaction", async () => {
  const t = convexTest(schema);
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  await t.mutation(async () => null);
  await t.mutation(async () => null);
  clock.mockReturnValue(now - 1000);
  expect(await t.query(async () => Date.now())).toBe(now + 1);
  expect(Date.now()).toBe(now - 1000);
  clock.mockRestore();
  expect(Date.now()).toBeGreaterThan(now);

  vi.spyOn(Date, "now").mockReturnValue(now - 2000);
  expect(await t.query(async () => Date.now())).toBe(now + 1);
  expect(Date.now()).toBe(now - 2000);
});

test.each(["before", "after"])(
  "Date stubs installed %s initialization can be restored",
  async (when) => {
    const BaseDate = Date;
    class MockDate extends BaseDate {
      static now() {
        return now;
      }
    }
    if (when === "before") vi.stubGlobal("Date", MockDate);
    const t = convexTest(schema);
    if (when === "after") vi.stubGlobal("Date", MockDate);
    await t.mutation(async () => null);
    await t.mutation(async () => null);
    expect(await t.query(async () => Date.now())).toBe(now + 1);
    expect(Date).toBe(MockDate);
    vi.unstubAllGlobals();
    expect(Date).toBe(BaseDate);
    expect(await t.query(async () => Date.now())).toBeGreaterThan(now + 1);
  },
);

test("scheduled timers use the wall clock when transaction time is pinned", async () => {
  vi.useFakeTimers({ now });
  const t = convexTest(schema);
  await t.mutation(async (ctx) => {
    vi.setSystemTime(now + 1000);
    await ctx.scheduler.runAfter(500, api.scheduler.add, {
      author: "test",
      body: "already due",
    });
  });
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  const message = await t.query(async (ctx) =>
    ctx.db.query("messages").first(),
  );
  expect(message?.body).toBe("already due");
});
