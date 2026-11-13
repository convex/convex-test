import type { FunctionReference_future, FunctionArgs } from "convex/server";
import { expect, expectTypeOf, test } from "vitest";
import { defineTestApp } from "../index";
import schema from "./schema";
import { v } from "convex/values";

const app = defineTestApp({ schema });
const fixture = app.defineModules({
  refs: {
    query: app.query({
      args: { value: v.number() },
      returns: v.number(),
      handler: async (_, { value }) => value,
    }),
    mutation: app.internalMutation({
      args: { value: v.number() },
      returns: v.number(),
      handler: async (_, { value }) => value,
    }),
    action: app.action({
      args: { value: v.number() },
      returns: v.number(),
      handler: async (_, { value }) => value,
    }),
    empty: app.query({
      args: {},
      returns: v.null(),
      handler: async () => null,
    }),
  },
});

test("future references preserve arguments, visibility, and results", async () => {
  const t = fixture.createTest();
  const query: FunctionReference_future<
    "query",
    "public",
    { value: number },
    number
  > = fixture.api.refs.query;
  const mutation: FunctionReference_future<
    "mutation",
    "internal",
    { value: number },
    number
  > = fixture.internal.refs.mutation;
  const action: FunctionReference_future<
    "action",
    "public",
    { value: number },
    number
  > = fixture.api.refs.action;
  const empty: FunctionReference_future<
    "query",
    "public",
    FunctionArgs<typeof fixture.api.refs.empty>,
    null
  > = fixture.api.refs.empty;
  expectTypeOf(t.query(query, { value: 1 })).toEqualTypeOf<Promise<number>>();
  expectTypeOf(t.mutation(mutation, { value: 2 })).toEqualTypeOf<
    Promise<number>
  >();
  expectTypeOf(t.action(action, { value: 3 })).toEqualTypeOf<Promise<number>>();
  expect(await t.query(query, { value: 1 })).toBe(1);
  expect(await t.mutation(mutation, { value: 2 })).toBe(2);
  expect(await t.action(action, { value: 3 })).toBe(3);
  expect(await t.query(empty)).toBeNull();
  expectTypeOf(t.query(async () => "inline")).toEqualTypeOf<Promise<string>>();
});

// Typechecking must reject the same invalid calls for both reference forms.
function invalidCalls(
  t: ReturnType<typeof fixture.createTest>,
  query: FunctionReference_future<"query", "public", { value: number }, number>,
) {
  // @ts-expect-error Required arguments cannot be omitted.
  void t.query(query);
  // @ts-expect-error Wrong argument type.
  void t.query(query, { value: "bad" });
  // @ts-expect-error Extra arguments are rejected.
  void t.query(query, { value: 1, extra: true });
  // @ts-expect-error A query cannot be called as a mutation.
  void t.mutation(query, { value: 1 });
}
void invalidCalls;
