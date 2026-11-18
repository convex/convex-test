import { FunctionHandle } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getConfig = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("config").unique(),
});

export const greet = mutation({
  args: { name: v.string() },
  returns: v.string(),
  handler: async (ctx, { name }) => {
    const config = (await ctx.db.query("config").unique())!;
    const text = `${config.greeting}, ${name}`;
    await ctx.db.insert("greetings", { text });
    if (config.onGreet !== undefined) {
      await ctx.runMutation(
        config.onGreet as FunctionHandle<"mutation", { text: string }>,
        { text },
      );
    }
    return text;
  },
});
