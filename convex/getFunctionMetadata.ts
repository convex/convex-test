import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

export const metadataQuery = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});

export const metadataMutation = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});

export const metadataAction = action({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});

export const internalMetadataQuery = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});

export const internalMetadataMutation = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});

export const internalMetadataAction = internalAction({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});

export const nestedInternalMetadata = action({
  args: {},
  handler: async (ctx): Promise<unknown[]> => {
    return [
      await ctx.runQuery(internal.getFunctionMetadata.internalMetadataQuery),
      await ctx.runMutation(
        internal.getFunctionMetadata.internalMetadataMutation,
      ),
      await ctx.runAction(internal.getFunctionMetadata.internalMetadataAction),
    ];
  },
});

export default query({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});
