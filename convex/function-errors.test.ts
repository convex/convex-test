import { expect, test } from "vitest";
import { defineSchema, defineTable } from "convex/server";
import { ConvexError, v } from "convex/values";
import { defineTestApp } from "../index";

class NotFoundError extends Error {
  code = "NOT_FOUND";
}

const schema = defineSchema({ log: defineTable({ label: v.string() }) });
const app = defineTestApp({ schema });
const fixture = app.defineModules({
  m: {
    throwsCustom: app.internalMutation({
      args: {},
      returns: v.null(),
      handler: async () => {
        throw new NotFoundError("missing");
      },
    }),
    throwsBigintData: app.internalMutation({
      args: {},
      returns: v.null(),
      handler: async () => {
        throw new ConvexError({ code: 404n });
      },
    }),
    catchesBigintData: app.mutation({
      args: {},
      returns: v.any(),
      handler: async (ctx): Promise<any> => {
        try {
          await ctx.runMutation(fixture.internal.m.throwsBigintData, {});
          return "no error";
        } catch (e) {
          return e instanceof ConvexError
            ? e.data
            : `not a ConvexError: ${String(e)}`;
        }
      },
    }),
  },
  a: {
    catchesCustom: app.action({
      args: {},
      returns: v.any(),
      handler: async (ctx) => {
        try {
          await ctx.runMutation(fixture.internal.m.throwsCustom, {});
          return null;
        } catch (e: any) {
          return {
            isNotFoundError: e instanceof NotFoundError,
            code: e.code ?? null,
            message: e.message,
          };
        }
      },
    }),
  },
});

test("errors: ctx.runMutation errors reach actions as a fresh Error", async () => {
  const t = fixture.createTest();
  const caught = await t.action(fixture.api.a.catchesCustom, {});

  expect(caught).toMatchObject({ isNotFoundError: false, code: null });
  expect(caught!.message).toMatch(/^Uncaught Error: missing/);
});

test("errors: ConvexError bigint data survives ctx.runMutation from a mutation", async () => {
  const t = fixture.createTest();
  const data = await t.mutation(fixture.api.m.catchesBigintData, {});

  expect(data).toEqual({ code: 404n });
});
