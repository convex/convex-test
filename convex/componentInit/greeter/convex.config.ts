import { defineComponent } from "convex/server";
import { api, internal } from "./_generated/api";
import echo from "../echo/convex.config";

const component = defineComponent("greeter", {
  init: internal.init.default,
});

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
