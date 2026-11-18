import { query } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("values").unique())?.value,
});
