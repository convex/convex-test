import { expect, test } from "vitest";
import { convexTest } from "../index";

async function filterDocs(
  docs: Record<string, any>[],
  filter: (q: any) => any,
): Promise<Record<string, any>[]> {
  const t = convexTest();
  return await t.run(async (ctx: any) => {
    for (const doc of docs) {
      await ctx.db.insert("items", doc);
    }
    const results = await ctx.db.query("items").filter(filter).collect();
    return results.map(({ _id, _creationTime, ...fields }: any) => fields);
  });
}

test("filter: arithmetic on a missing field throws", async () => {
  await expect(
    filterDocs([{ score: 5, bonus: 1 }, { score: 20 }], (q) =>
      q.gt(q.add(q.field("score"), q.field("bonus")), 3),
    ),
  ).rejects.toThrow(/Cannot add/);
});

test("filter: q.neg is supported", async () => {
  const results = await filterDocs([{ value: 3 }, { value: -3 }], (q) =>
    q.gt(q.neg(q.field("value")), 0),
  );

  expect(results).toEqual([{ value: -3 }]);
});

test("filter: a non-boolean filter result throws", async () => {
  await expect(
    filterDocs([{ done: true }, { title: "no done field" }], (q) =>
      q.field("done"),
    ),
  ).rejects.toThrow(/as a Boolean/);
});

test("filter: q.and requires boolean operands", async () => {
  await expect(
    filterDocs([{ count: 1 }], (q) => q.and(q.field("count"), true)),
  ).rejects.toThrow(/as a Boolean/);
});
