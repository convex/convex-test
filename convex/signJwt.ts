import { v } from "convex/values";
import { components } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";

export const sign = mutation({
  args: { claims: v.optional(v.any()), expiresInSeconds: v.number() },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await ctx.auth.signJwt(args);
  },
});

// Signs before and after the component does, to show the issuer follows the
// component the code runs in.
export const signAroundComponent = mutation({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const before = await ctx.auth.signJwt({ expiresInSeconds: 60 });
    const fromComponent = await ctx.runMutation(
      components.counter.signJwt.sign,
      {},
    );
    const after = await ctx.auth.signJwt({ expiresInSeconds: 60 });
    return [before, fromComponent, after];
  },
});

export const signFromQuery = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => "signJwt" in ctx.auth,
});

export const signFromAction = action({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => "signJwt" in ctx.auth,
});
