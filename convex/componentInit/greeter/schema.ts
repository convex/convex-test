import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  config: defineTable({
    greeting: v.string(),
    onGreet: v.optional(v.function()),
    counter: v.optional(v.any()),
    initRuns: v.number(),
  }),
  greetings: defineTable({ text: v.string() }),
});
