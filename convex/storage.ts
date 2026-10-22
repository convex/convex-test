import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

/// helpers

export const listFiles = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.system.query("_storage").collect();
  },
});

/// action store blob (storage/storeBlob)

export const actionStoreBlob = internalAction({
  args: {
    bytes: v.bytes(),
  },
  handler: async (ctx, { bytes }) => {
    return await ctx.storage.store(new Blob([bytes]));
  },
});

/// action get blob (storage/getBlob)

export const actionGetBlob = internalAction({
  args: {
    id: v.id("_storage"),
  },
  handler: async (ctx, { id }) => {
    return (await ctx.storage.get(id))?.arrayBuffer();
  },
});

/// action delete blob (1.0/storageDelete)

export const actionDeleteBlob = internalAction({
  args: {
    id: v.id("_storage"),
  },
  handler: async (ctx, { id }) => {
    await ctx.storage.delete(id);
  },
});

/// mutation delete blob (1.0/storageDelete)

export const mutationDeleteBlob = internalMutation({
  args: {
    id: v.id("_storage"),
  },
  handler: async (ctx, { id }) => {
    await ctx.storage.delete(id);
  },
});

/// query get URL (1.0/storageGetUrl)

export const queryGetUrl = internalQuery({
  args: {
    id: v.id("_storage"),
  },
  handler: async (ctx, { id }) => {
    return await ctx.storage.getUrl(id);
  },
});

/// mutation generate upload URL (1.0/storageGenerateUploadUrl)

export const mutationGenerateUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/// mutation store blob (1.0/storageStore)

export const mutationStoreBlob = internalMutation({
  args: {
    bytes: v.bytes(),
    contentType: v.optional(v.string()),
    sha256: v.optional(v.string()),
  },
  handler: async (ctx, { bytes, contentType, sha256 }) => {
    return await ctx.storage.store(new Blob([bytes], { type: contentType }), {
      sha256,
    });
  },
});

/// mutation get blob (1.0/storageGet)

export const mutationGetBlob = internalMutation({
  args: {
    id: v.id("_storage"),
  },
  handler: async (ctx, { id }) => {
    const blob = await ctx.storage.get(id);
    if (blob === null) {
      return null;
    }
    return { bytes: await blob.arrayBuffer(), type: blob.type };
  },
});

export const mutationStoreAndGetBlob = internalMutation({
  args: {
    bytes: v.bytes(),
  },
  handler: async (ctx, { bytes }) => {
    const id = await ctx.storage.store(new Blob([bytes]));
    return (await ctx.storage.get(id))?.arrayBuffer();
  },
});

export const mutationStoreBlobThenThrow = internalMutation({
  args: {
    bytes: v.bytes(),
  },
  handler: async (ctx, { bytes }) => {
    await ctx.storage.store(new Blob([bytes]));
    throw new Error("rollback");
  },
});
