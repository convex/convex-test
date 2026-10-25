/**
 * Indexed reads (`withIndex`, with any order and bounds) return what a scan
 * of the table finds, filtered and ordered as Convex orders an index (its
 * fields, then `_creationTime`, then `_id`). Checked over a seeded random run
 * of inserts, patches that move documents within an index, replaces,
 * deletes, child mutations that commit or roll back, and reads in the middle
 * of writes. The expectation comes from `db.get` over every inserted id, so it
 * does not rely on the table scans or index reads under test.
 */
import {
  defineSchema,
  defineTable,
  internalMutationGeneric,
  makeFunctionReference,
} from "convex/server";
import { compareValues, v } from "convex/values";
import { convexTest } from "../index";
import { describe, expect, it } from "vitest";

import type { GenericMutationCtx } from "convex/server";
import type { TestConvex as AnyTestConvex } from "../index";
import type { GenericId, Value } from "convex/values";

const schema = defineSchema({
  rows: defineTable({
    a: v.number(),
    b: v.optional(v.string()),
    c: v.number(),
  })
    .index("by_a_b", ["a", "b"])
    .index("by_c", ["c"]),
  others: defineTable({ a: v.number() }).index("by_a", ["a"]),
});

type Row = {
  _id: GenericId<"rows">;
  _creationTime: number;
  a: number;
  b?: string;
  c: number;
};
type Ctx = GenericMutationCtx<any>;
type TestConvex = AnyTestConvex<typeof schema>;

/** A deterministic generator (mulberry32), so a failure replays. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Next = () => number;
const pick = <T>(next: Next, items: ReadonlyArray<T>): T =>
  items[Math.floor(next() * items.length)];
const B_VALUES = [undefined, "", "a", "b", "bb", "c"];
const someB = (next: Next) => pick(next, B_VALUES);
const someA = (next: Next) => Math.floor(next() * 4);
const someC = (next: Next) => Math.floor(next() * 20) / 2;

/** Convex's order for an index: its fields, then creation time, then id. */
function compareBy(fields: ReadonlyArray<keyof Row>) {
  return (x: Row, y: Row) => {
    for (const field of [...fields, "_creationTime", "_id"] as const) {
      const c = compareValues(x[field] as Value, y[field] as Value);
      if (c !== 0) return c;
    }
    return 0;
  };
}

type Bound = { op: "gt" | "gte" | "lt" | "lte"; value: Value | undefined };
type Read = {
  index: "by_a_b" | "by_c";
  eq?: number;
  bounds: Array<Bound>;
  order: "asc" | "desc";
};

function someRead(next: Next): Read {
  const order = next() < 0.5 ? "asc" : "desc";
  const lower = (value: Value | undefined): Bound => ({
    op: next() < 0.5 ? "gt" : "gte",
    value,
  });
  const upper = (value: Value | undefined): Bound => ({
    op: next() < 0.5 ? "lt" : "lte",
    value,
  });
  const bounds = (value: () => Value | undefined) => {
    const chosen: Array<Bound> = [];
    if (next() < 0.5) chosen.push(lower(value()));
    if (next() < 0.5) chosen.push(upper(value()));
    return next() < 0.5 ? chosen : chosen.reverse();
  };
  if (next() < 0.6) {
    const eq = next() < 0.9 ? someA(next) : undefined;
    return {
      index: "by_a_b",
      eq,
      bounds: eq === undefined ? [] : bounds(() => someB(next)),
      order,
    };
  }
  return { index: "by_c", bounds: bounds(() => someC(next)), order };
}

function matches(read: Read, row: Row) {
  if (read.eq !== undefined && compareValues(row.a, read.eq) !== 0)
    return false;
  const field = read.index === "by_a_b" ? "b" : "c";
  return read.bounds.every(({ op, value }) => {
    const c = compareValues(row[field] as Value, value as Value);
    return op === "gt"
      ? c > 0
      : op === "gte"
        ? c >= 0
        : op === "lt"
          ? c < 0
          : c <= 0;
  });
}

function indexed(ctx: Ctx, read: Read) {
  return ctx.db.query("rows").withIndex(read.index, (q: any) => {
    let range = q;
    if (read.index === "by_a_b") {
      if (read.eq === undefined) return range;
      range = range.eq("a", read.eq);
    }
    const field = read.index === "by_a_b" ? "b" : "c";
    for (const { op, value } of read.bounds) range = range[op](field, value);
    return range;
  });
}

/**
 * Every id a run has inserted, rolled back or not: the table's documents are
 * those `db.get` still finds, an expectation kept apart from the table scans
 * and index reads under test.
 */
const inserted = new Set<GenericId<"rows">>();

async function rowsByGet(ctx: Ctx) {
  const rows: Array<Row> = [];
  for (const id of inserted) {
    const row = (await ctx.db.get(id)) as Row | null;
    if (row !== null) rows.push(row);
  }
  return rows;
}

/** Every way of reading `read` agrees with the documents `db.get` finds. */
async function expectReadsAgree(ctx: Ctx, read: Read) {
  const all = await rowsByGet(ctx);
  const byId = (x: Row, y: Row) => (x._id < y._id ? -1 : 1);
  expect(
    ((await ctx.db.query("rows").collect()) as Array<Row>).sort(byId),
  ).toEqual([...all].sort(byId));
  const expected = all
    .filter((row) => matches(read, row))
    .sort(compareBy(read.index === "by_a_b" ? ["a", "b"] : ["c"]));
  if (read.order === "desc") expected.reverse();
  const ids = (rows: ReadonlyArray<Row>) => rows.map((row) => row._id);
  const query = () => indexed(ctx, read).order(read.order);
  expect(ids(await query().collect()), JSON.stringify(read)).toEqual(
    ids(expected),
  );
  expect((await query().first())?._id ?? null).toBe(expected[0]?._id ?? null);
  expect(ids(await query().take(3))).toEqual(ids(expected.slice(0, 3)));
  return ids(expected);
}

/**
 * `read` page by page, one transaction a page (a function may paginate once),
 * against a scan.
 */
async function expectPagesAgree(t: TestConvex, read: Read) {
  const expected = await t.run(
    async (ctx) => await expectReadsAgree(ctx, read),
  );
  const paged: Array<string> = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await t.run(
      async (ctx) =>
        (await indexed(ctx, read)
          .order(read.order)
          .paginate({ numItems: 4, cursor })) as {
          page: Array<Row>;
          isDone: boolean;
          continueCursor: string;
        },
    );
    paged.push(...page.page.map((row) => row._id));
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(paged).toEqual(expected);
}

async function someWrites(ctx: Ctx, next: Next, count: number) {
  for (let i = 0; i < count; i++) {
    const rows = await rowsByGet(ctx);
    const roll = next();
    if (rows.length === 0 || roll < 0.45) {
      const id = await ctx.db.insert("rows", {
        a: someA(next),
        b: someB(next),
        c: someC(next),
      });
      inserted.add(id);
      await ctx.db.insert("others", { a: someA(next) });
    } else if (roll < 0.8) {
      const row = pick(next, rows);
      await ctx.db.patch(row._id, {
        ...(next() < 0.5 ? { a: someA(next) } : {}),
        b: someB(next),
        ...(next() < 0.5 ? { c: someC(next) } : {}),
      });
    } else if (roll < 0.9) {
      const row = pick(next, rows);
      await ctx.db.replace(row._id, { a: someA(next), c: someC(next) });
    } else {
      await ctx.db.delete(pick(next, rows)._id);
    }
  }
}

const seeds = { next: random(1) };
const writeAndRead = makeFunctionReference<"mutation", { fail: boolean }>(
  "work:writeAndRead",
);
const work = {
  /** Writes, reads in the middle of its writes, and maybe throws. */
  writeAndRead: internalMutationGeneric({
    args: { fail: v.boolean() },
    handler: async (ctx, { fail }) => {
      const next = seeds.next;
      await someWrites(ctx, next, 3);
      await expectReadsAgree(ctx, someRead(next));
      if (fail) throw new Error("rolled back");
    },
  }),
  /** Child mutations, one rolled back, between its own writes and reads. */
  parent: internalMutationGeneric({
    args: {},
    handler: async (ctx) => {
      const next = seeds.next;
      await someWrites(ctx, next, 2);
      await ctx.runMutation(writeAndRead, { fail: false });
      await expectReadsAgree(ctx, someRead(next));
      await ctx
        .runMutation(writeAndRead, { fail: true })
        .catch((error: Error) => expect(error.message).toMatch(/rolled back/));
      await expectReadsAgree(ctx, someRead(next));
    },
  }),
};
const parent = makeFunctionReference<"mutation">("work:parent");

const modules = {
  "/backend/_generated/api.js": () => Promise.resolve({}),
  "/backend/work.js": () => Promise.resolve(work),
};

describe("indexed reads", () => {
  it.each([1, 2, 3])(
    "match a scan through a random run of writes (seed %i)",
    async (seed) => {
      seeds.next = random(seed);
      inserted.clear();
      const next = seeds.next;
      const t = convexTest(schema, modules);
      for (let step = 0; step < 60; step++) {
        const roll = next();
        if (roll < 0.5) {
          await t.run(async (ctx) => {
            await someWrites(ctx, next, 1 + Math.floor(next() * 6));
            await expectReadsAgree(ctx, someRead(next));
          });
        } else if (roll < 0.7) {
          await t.mutation(parent, {});
        } else if (roll < 0.8) {
          await expect(
            t.run(async (ctx) => {
              await someWrites(ctx, next, 3);
              throw new Error("rolled back");
            }),
          ).rejects.toThrow(/rolled back/);
        }
        await t.run(async (ctx) => {
          for (let i = 0; i < 3; i++)
            await expectReadsAgree(ctx, someRead(next));
        });
        await expectPagesAgree(t, someRead(next));
      }
      const count = await t.run(async (ctx) => (await rowsByGet(ctx)).length);
      expect(count).toBeGreaterThan(20);
    },
  );
});
