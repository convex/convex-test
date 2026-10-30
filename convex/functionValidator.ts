import { FunctionHandle, createFunctionHandle } from "convex/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation, query } from "./_generated/server";

export const target = mutation({
  args: { jobId: v.string() },
  returns: v.null(),
  handler: () => null,
});

export const createHandle = mutation({
  args: {},
  returns: v.function({
    fnType: "mutation",
    args: { jobId: v.string() },
    returns: v.null(),
  }),
  handler: async (): Promise<
    FunctionHandle<"mutation", { jobId: string }, null>
  > => {
    return await createFunctionHandle(api.functionValidator.target);
  },
});

export const returnsBadHandle = query({
  args: {},
  returns: v.function(),
  handler: () => "not a handle" as any,
});

export const callHandle = mutation({
  args: {
    onComplete: v.function({
      fnType: "mutation",
      args: { jobId: v.string() },
      returns: v.null(),
    }),
  },
  handler: async (ctx, { onComplete }) => {
    return await ctx.runMutation(onComplete, { jobId: "job" });
  },
});

export const acceptsOptionalHandle = query({
  args: { handle: v.optional(v.function()) },
  handler: () => "ok",
});

export const storeHandle = mutation({
  args: { handle: v.any() },
  handler: async (ctx, { handle }) => {
    const id = await ctx.db.insert("functionHandles", { handle });
    return (await ctx.db.get(id))!.handle;
  },
});
