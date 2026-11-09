import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { TestConvex } from "../../index";
import type { ComponentApi } from "./component/_generated/component";
import schema from "./component/schema";

export type { ComponentApi } from "./component/_generated/component";

const modules = import.meta.glob("./component/**/*.ts");

// Match the testing entry point convention used by published components.
export function register<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(t: TestConvex<Schema>, name = "counter"): ComponentApi {
  return t.registerComponent<ComponentApi>(name, schema, modules);
}

export default { register, schema, modules };
