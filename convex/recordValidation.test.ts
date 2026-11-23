import { anyApi, defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { convexTest } from "../index";
import { action, mutation, query } from "./_generated/server";

const record = v.record(v.string(), v.number());
const schema = defineSchema({ scores: defineTable({ byPlayer: record }) });

function setup() {
  return convexTest({
    schema,
    modules: {
      "./_generated/server.ts": () => Promise.resolve({}),
      "./records.ts": () =>
        Promise.resolve({
          query: query({ args: { scores: record }, handler: () => null }),
          mutation: mutation({ args: { scores: record }, handler: () => null }),
          action: action({ args: { scores: record }, handler: () => null }),
          returns: query({
            args: { value: v.any() },
            returns: record,
            handler: (_ctx, { value }) => value,
          }),
          keyed: query({
            args: { scores: v.record(v.id("scores"), v.number()) },
            handler: () => null,
          }),
          nested: query({
            args: {
              scores: v.record(v.string(), v.record(v.string(), v.number())),
            },
            handler: () => null,
          }),
        }),
    },
  });
}

const invalidRecords = [
  null,
  "not a record",
  42,
  true,
  [],
  [1],
  new ArrayBuffer(1),
  { ada: "one" },
];

for (const kind of ["query", "mutation", "action"] as const) {
  function invoke(t: ReturnType<typeof setup>, scores: unknown) {
    switch (kind) {
      case "query":
        return t.query(anyApi.records.query, { scores });
      case "mutation":
        return t.mutation(anyApi.records.mutation, { scores });
      case "action":
        return t.action(anyApi.records.action, { scores });
    }
  }
  test.each(invalidRecords)(
    `${kind} rejects invalid record %j`,
    async (scores) => {
      const t = setup();
      await expect(invoke(t, scores)).rejects.toThrow("Validator error");
    },
  );
  test.each([{}, { ada: 1, grace: 2 }])(
    `${kind} accepts record %j`,
    async (scores) => {
      const t = setup();
      await expect(invoke(t, scores)).resolves.toBeNull();
    },
  );
}

test.each(invalidRecords)(
  "return validator rejects invalid record %j",
  async (value) => {
    const t = setup();
    await expect(t.query(anyApi.records.returns, { value })).rejects.toThrow(
      "Return value validation failed",
    );
  },
);

test.each([{}, { ada: 1 }])(
  "return validator accepts record %j",
  async (value) => {
    const t = setup();
    await expect(t.query(anyApi.records.returns, { value })).resolves.toEqual(
      value,
    );
  },
);

test.each(invalidRecords)(
  "schema rejects invalid record %j",
  async (byPlayer) => {
    const t = setup();
    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert("scores", { byPlayer: byPlayer as any });
      }),
    ).rejects.toThrow("Validator error");
  },
);

test("schema validates records on insert, patch, and replace", async () => {
  const t = setup();
  const id = await t.run((ctx) => ctx.db.insert("scores", { byPlayer: {} }));
  await t.run((ctx) => ctx.db.patch(id, { byPlayer: { ada: 1 } }));
  await t.run((ctx) => ctx.db.replace(id, { byPlayer: { grace: 2 } }));
  for (const operation of ["patch", "replace"] as const) {
    await expect(
      t.run((ctx) =>
        operation === "patch"
          ? ctx.db.patch(id, { byPlayer: { ada: "one" } as any })
          : ctx.db.replace(id, { byPlayer: { ada: "one" } as any }),
      ),
    ).rejects.toThrow("Validator error");
  }
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
    byPlayer: { grace: 2 },
  });
});

test("record keys are validated against their validator", async () => {
  const t = setup();
  const id = await t.run((ctx) => ctx.db.insert("scores", { byPlayer: {} }));
  await expect(
    t.query(anyApi.records.keyed, { scores: { [id]: 1 } }),
  ).resolves.toBeNull();
  await expect(
    t.query(anyApi.records.keyed, { scores: { invalid: 1 } }),
  ).rejects.toThrow("Validator error");
});

test("record values are validated recursively", async () => {
  const t = setup();
  await expect(
    t.query(anyApi.records.nested, { scores: { round: { ada: 1 } } }),
  ).resolves.toBeNull();
  await expect(
    t.query(anyApi.records.nested, { scores: { round: { ada: "one" } } }),
  ).rejects.toThrow("Validator error");
});
