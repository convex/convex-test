import { defineComponent } from "convex/server";
import { internal } from "./_generated/api";

export default defineComponent("echo", {
  init: internal.init.default,
});
