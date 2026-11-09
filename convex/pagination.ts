import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { api } from "./_generated/api";

/// paginate (1.0/queryPage)

export const paginateTwice = internalQuery({
  args: { nested: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { nested }) => {
    for (let i = 0; i < 2; i++) {
      const paginationOptions = { cursor: null, numItems: 10 };
      if (nested) {
        await ctx.runQuery(api.pagination.listAll, { paginationOptions });
      } else {
        await ctx.db.query("messages").paginate(paginationOptions);
      }
    }
    return null;
  },
});

export const list = query({
  args: {
    author: v.string(),
    paginationOptions: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("author"), args.author))
      .paginate(args.paginationOptions);
  },
});

export const listAll = query({
  args: {
    paginationOptions: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("messages").paginate(args.paginationOptions);
  },
});

export const listWithIndex = query({
  args: {
    author: v.string(),
    paginationOptions: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("author", (q) => q.eq("author", args.author))
      .paginate(args.paginationOptions);
  },
});

export const listWithOptionalFieldIndex = query({
  args: {
    author: v.string(),
    paginationOptions: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("author_score", (q) => q.eq("author", args.author))
      .paginate(args.paginationOptions);
  },
});

export const listWithCompositeIndex = query({
  args: {
    author: v.string(),
    paginationOptions: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("author_body", (q) => q.eq("author", args.author))
      .paginate(args.paginationOptions);
  },
});
