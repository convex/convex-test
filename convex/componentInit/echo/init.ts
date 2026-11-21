import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export default internalMutation({
  args: { value: v.any() },
  returns: v.null(),
  handler: async (ctx, { value }) => {
    const existing = await ctx.db.query("values").unique();
    if (existing) {
      await ctx.db.replace(existing._id, { value });
    } else {
      await ctx.db.insert("values", { value });
    }
    return null;
  },
});
