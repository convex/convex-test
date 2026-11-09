import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const sign = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.auth.signJwt({ expiresInSeconds: 60 });
  },
});
