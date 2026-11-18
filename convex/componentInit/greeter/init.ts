import { v } from "convex/values";
import { api } from "./_generated/api";
import { env, internalMutation } from "./_generated/server";

export default internalMutation({
  args: {
    greeting: v.string(),
    onGreet: v.optional(v.function()),
    counter: v.optional(v.any()),
    misbehave: v.optional(
      v.union(
        v.literal("throw"),
        v.literal("readEnv"),
        v.literal("callFunction"),
        v.literal("storeFile"),
        v.literal("writeTooMuch"),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { misbehave, ...config }) => {
    const existing = await ctx.db.query("config").unique();
    const initRuns = (existing?.initRuns ?? 0) + 1;
    if (existing) {
      await ctx.db.replace(existing._id, { ...config, initRuns });
    } else {
      await ctx.db.insert("config", { ...config, initRuns });
    }
    switch (misbehave) {
      case "throw":
        throw new Error("init failed on purpose");
      case "readEnv":
        console.log(env.CONVEX_CLOUD_URL);
        break;
      case "callFunction":
        await ctx.runQuery(api.public.getConfig, {});
        break;
      case "storeFile":
        await ctx.storage.store(new Blob(["hello"]));
        break;
      case "writeTooMuch":
        for (let i = 0; i < 101; i++) {
          await ctx.db.insert("greetings", { text: `${i}` });
        }
        break;
    }
    return null;
  },
});
