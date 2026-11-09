/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { components, internal } from "./_generated/api";
import { createFunctionHandle } from "convex/server";

// These tests reproduce the various ways a user might rely on a component
// without having registered it via `t.registerComponent`. The goal is to
// assert that the error message clearly points at the missing registration
// (and not, say, at some downstream error inside the test harness).

test("direct query on unregistered component surfaces a clear error", async () => {
  const t = convexTest(schema);
  await expect(
    t.query(components.counter.public.count, { name: "beans" }),
  ).rejects.toThrow(/registerComponent/);
});

test("direct mutation on unregistered component surfaces a clear error", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(components.counter.public.add, { name: "beans", count: 1 }),
  ).rejects.toThrow(/registerComponent/);
});

test("direct action on unregistered component surfaces a clear error", async () => {
  const t = convexTest(schema);
  await expect(
    t.action(components.counter.public.countMany, { names: ["beans"] }),
  ).rejects.toThrow(/registerComponent/);
});

test("ctx.runMutation into unregistered component surfaces a clear error", async () => {
  // `internal.component.directCall` calls into `components.counter.*` via
  // `ctx.runMutation`. If the user forgets to register `counter`, the error
  // should point at the missing registration rather than something deeper.
  const t = convexTest(schema);
  await expect(t.action(internal.component.directCall)).rejects.toThrow(
    /registerComponent/,
  );
});

test("createFunctionHandle for unregistered component surfaces a clear error", async () => {
  const t = convexTest(schema);
  await expect(t.query(internal.component.getFunctionHandle)).rejects.toThrow(
    /registerComponent/,
  );
});

test("scheduling into unregistered component fails eagerly at schedule time", async () => {
  // The schedule call itself should surface the missing registration, rather
  // than silently succeeding and then failing later inside the scheduled
  // function (where the error would only be logged to console.error).
  const t = convexTest(schema);
  await expect(
    t.mutation(async (ctx) => {
      await ctx.scheduler.runAfter(0, components.counter.public.add, {
        name: "beans",
        count: 1,
      });
    }),
  ).rejects.toThrow(/registerComponent/);
});

test("createFunctionHandle for unregistered component fails eagerly", async () => {
  // `createFunctionHandle` previously returned a handle string without
  // validating that the target component was registered, deferring the error
  // to handle-use time (and producing confusing stack traces). It should now
  // fail at handle creation.
  const t = convexTest(schema);
  await expect(
    t.mutation(async () => {
      await createFunctionHandle(components.counter.public.add);
    }),
  ).rejects.toThrow(/registerComponent/);
});

test("error message lists currently-registered components to catch typos", async () => {
  // If the user registered "counter" but tried to call "couner" (typo), the
  // error should make the available components visible so the typo is easy
  // to spot.
  const t = convexTest(schema);
  // Register an unrelated name so the message has something to list.
  t.registerComponent(
    "counter2",
    (await import("./counter/component/schema")).default,
    import.meta.glob("./counter/component/**/*.ts"),
  );
  await expect(
    t.query(components.counter.public.count, { name: "beans" }),
  ).rejects.toThrow(/Registered components: "counter2"/);
});

test("error message points at the component's `/test` register helper", async () => {
  // Published components conventionally export a `register` helper from a
  // `/test` entrypoint. The error should nudge users toward that helper
  // before falling back to calling `t.registerComponent` by hand.
  const t = convexTest(schema);
  await expect(
    t.query(components.counter.public.count, { name: "beans" }),
  ).rejects.toThrow(/register\(t\)/);
});

test("error message says when no components are registered", async () => {
  const t = convexTest(schema);
  await expect(
    t.query(components.counter.public.count, { name: "beans" }),
  ).rejects.toThrow(
    /No components have been registered on this `convexTest` instance/,
  );
});
