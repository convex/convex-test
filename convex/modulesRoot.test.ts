/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { api } from "./_generated/api";

test("uses the app's _generated directory when a component's sorts first", async () => {
  const allModules = import.meta.glob("./**/*.*s");
  const entries = Object.entries(allModules);
  const componentFirst = Object.fromEntries([
    ...entries.filter(([path]) => path.startsWith("./counter/")),
    ...entries.filter(([path]) => !path.startsWith("./counter/")),
  ]);
  expect(Object.keys(componentFirst)[0]).toContain("_generated");
  const t = convexTest(schema, componentFirst);
  expect(await t.query(api.getDeploymentMetadata.metadataQuery)).toEqual({
    name: "test",
    region: null,
    class: "s16",
  });
});
