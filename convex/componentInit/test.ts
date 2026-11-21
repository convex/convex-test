import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { TestConvex } from "../../index";
import echoSchema from "./echo/schema";
import greeterSchema from "./greeter/schema";

const greeterModules = import.meta.glob("./greeter/**/*.ts");
const echoModules = import.meta.glob("./echo/**/*.ts");

export function register<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(t: TestConvex<Schema>, name = "greeter", args?: Record<string, unknown>) {
  t.registerComponent(name, greeterSchema, greeterModules, { args });
  t.registerComponent(`${name}/echo`, echoSchema, echoModules);
}
