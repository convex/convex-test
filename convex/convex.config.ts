import { defineApp } from "convex/server";
import { internal } from "./_generated/api";
import greeter from "./componentInit/greeter/convex.config.js";
import counter from "./counter/component/convex.config.js";

const app = defineApp();
const counterComponent = app.use(counter);
app.use(counter, { name: "counter2" });
app.use(greeter, {
  args: {
    greeting: "Hello",
    onGreet: internal.componentInit.onGreet,
    counter: counterComponent,
  },
});

export default app;
