import type { FunctionHandle } from "convex/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const invoke = mutation({
  args: { handle: v.string(), key: v.string(), fail: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { handle, ...args }) => {
    return await ctx.runMutation(
      handle as FunctionHandle<
        "mutation",
        { key: string; fail?: boolean },
        null
      >,
      args,
    );
  },
});
