import { defineComponent } from "convex/server";
import { api, internal } from "./_generated/api";
import echo from "../echo/convex.config";

// The `init` and `args` options are internal until component arguments are
// released, so their types aren't public yet.
const component = defineComponent("greeter", {
  init: internal.init.default,
} as any) as any;

component.use(echo, {
  args: {
    value: {
      greeting: component.args.greeting,
      greet: api.public.greet,
      list: [component.args.greeting, 1],
    },
  },
});

export default component;
