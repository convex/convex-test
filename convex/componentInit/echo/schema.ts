import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  values: defineTable({ value: v.any() }),
});
