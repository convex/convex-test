import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const onGreet = internalMutation({
  args: { text: v.string() },
  returns: v.null(),
  handler: async (ctx, { text }) => {
    await ctx.db.insert("messages", { author: "greeter", body: text });
    return null;
  },
});
