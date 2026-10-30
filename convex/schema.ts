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
      dimensions: 1536,
    }),
});
