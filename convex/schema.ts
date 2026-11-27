import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  commitTs: defineTable({
    commitTs: v.optional(v.commitTs()),
    patchedCommitTs: v.optional(v.commitTs()),
    replacedCommitTs: v.optional(v.commitTs()),
    nested: v.optional(v.object({ commitTs: v.commitTs() })),
    other: v.optional(v.string()),
  }).index("by_commit_ts", ["commitTs"]),
  functionHandles: defineTable({
    handle: v.function(),
  }),
  requestMetadata: defineTable({
    label: v.string(),
    metadata: v.object({
      ip: v.union(v.string(), v.null()),
      userAgent: v.union(v.string(), v.null()),
      requestId: v.string(),
      scheduledFunctionId: v.union(v.string(), v.null()),
      authToken: v.union(v.string(), v.null()),
    }),
  }),
  messages: defineTable({
    author: v.string(),
    body: v.string(),
    embedding: v.optional(v.array(v.number())),
    score: v.optional(v.number()),
  })
    .index("author", ["author"])
    .index("author_body", ["author", "body"])
    .index("author_score", ["author", "score"])
    .searchIndex("body", {
      searchField: "body",
      filterFields: ["author"],
    })
    .vectorIndex("embedding", {
      vectorField: "embedding",
      filterFields: ["author", "body"],
      dimensions: 3,
    }),
});
