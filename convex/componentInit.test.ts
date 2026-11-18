/// <reference types="vite/client" />

import { componentsGeneric } from "convex/server";
import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { internal } from "./_generated/api";
import { register } from "./componentInit/test";
import counterSchema from "./counter/component/schema";
import greeterSchema from "./componentInit/greeter/schema";

const counterModules = import.meta.glob("./counter/component/**/*.ts");
const greeterModules = import.meta.glob("./componentInit/greeter/**/*.ts");

const components = componentsGeneric() as any;

// The app can't call a grandchild component's functions, so read its data.
async function echoValue(t: ReturnType<typeof convexTest>) {
  return await (t as any).runInComponent("greeter/echo", async (ctx: any) => {
    return (await ctx.db.query("values").unique())?.value;
  });
}

function testWithGreeter(
  componentArgs?: Record<string, Record<string, unknown>>,
) {
  const t = convexTest({ schema, componentArgs });
  t.registerComponent("counter", counterSchema, counterModules);
  register(t);
  return t;
}

test("an init runs before the first call, with the args from the app's convex.config", async () => {
  const t = testWithGreeter();
  const config = await t.query(components.greeter.public.getConfig, {});
  expect(config).toMatchObject({
    greeting: "Hello",
    onGreet: "function://;componentInit:onGreet",
    initRuns: 1,
  });
});

test("a function reference arg is a handle to the parent's function", async () => {
  const t = testWithGreeter();
  const text = await t.mutation(components.greeter.public.greet, {
    name: "Ada",
  });
  expect(text).toEqual("Hello, Ada");
  const messages = await t.run((ctx) => ctx.db.query("messages").collect());
  expect(messages).toMatchObject([{ author: "greeter", body: "Hello, Ada" }]);
});

test("a component arg is an object of handles to its public functions", async () => {
  const t = testWithGreeter();
  const config = await t.query(components.greeter.public.getConfig, {});
  expect(config.counter.public.add).toEqual("function://counter;public:add");
  await t.mutation(config.counter.public.add, { name: "beans", count: 2 });
  expect(
    await t.query(components.counter.public.count, { name: "beans" }),
  ).toEqual(2);
});

test("a nested component gets its parent's forwarded args and references", async () => {
  const t = testWithGreeter();
  expect(await echoValue(t)).toEqual({
    greeting: "Hello",
    greet: "function://greeter;public:greet",
    list: ["Hello", 1],
  });
});

test("runInits runs every init again", async () => {
  const t = testWithGreeter();
  expect(
    (await t.query(components.greeter.public.getConfig, {})).initRuns,
  ).toEqual(1);
  await t.runInits();
  expect(
    (await t.query(components.greeter.public.getConfig, {})).initRuns,
  ).toEqual(2);
});

test("componentArgs replace the args from convex.config", async () => {
  const t = testWithGreeter({
    greeter: { greeting: "Hi", onGreet: internal.componentInit.onGreet },
  });
  const config = await t.query(components.greeter.public.getConfig, {});
  expect(config).toMatchObject({
    greeting: "Hi",
    onGreet: "function://;componentInit:onGreet",
  });
  expect(config.counter).toBeUndefined();
  expect(await echoValue(t)).toMatchObject({
    greeting: "Hi",
  });
});

test("registerComponent can pass args", async () => {
  const t = convexTest(schema);
  register(t, "other", { greeting: "Hey" });
  const config = await t.query(components.other.public.getConfig, {});
  expect(config.greeting).toEqual("Hey");
});

test("args that don't match the init's validator fail the first call", async () => {
  const t = testWithGreeter({ greeter: { greeting: 5 } });
  await expect(
    t.query(components.greeter.public.getConfig, {}),
  ).rejects.toThrow(/Invalid arguments for the init of component "greeter"/);
});

test("a failed init rolls back the push and lists each failure", async () => {
  const t = convexTest(schema);
  register(t, "first", { greeting: "a", misbehave: "throw" });
  register(t, "second", { greeting: "b", misbehave: "throw" });
  const error =
    /The push was rolled back because 2 inits failed:\n\ninit init of component "first":\n.*init failed on purpose[^]*init init of component "second"/;
  await expect(t.runInits()).rejects.toThrow(error);
  // The components are still uninitialized, so the next call retries.
  await expect(t.query(components.first.public.getConfig, {})).rejects.toThrow(
    error,
  );
});

test("a failed init's writes are rolled back", async () => {
  const t = convexTest(schema);
  t.registerComponent("greeter", greeterSchema, greeterModules, {
    args: { greeting: "a", misbehave: "throw" },
  });
  await expect(t.runInits()).rejects.toThrow(/an init failed/);
  t.registerComponent("greeter", greeterSchema, greeterModules, {
    args: { greeting: "a" },
  });
  const config = await t.query(components.greeter.public.getConfig, {});
  expect(config.initRuns).toEqual(1);
});

test.each([
  ["readEnv", /Can't use environment variables in an init function/],
  ["callFunction", /Can't call another function from an init function/],
  ["storeFile", /Too many files stored by this mutation \(limit: 0\)/],
  ["writeTooMuch", /limit: 100/],
])("an init restricts %s", async (misbehave, error) => {
  const t = convexTest(schema);
  t.registerComponent("greeter", greeterSchema, greeterModules, {
    args: { greeting: "a", misbehave },
  });
  await expect(t.runInits()).rejects.toThrow(error);
  // Outside an init, environment variables are readable again.
  expect(process.env.NODE_ENV).toBeDefined();
});

test("an argument can't forward a parent argument that doesn't exist", async () => {
  const t = testWithGreeter({
    "greeter/echo": { value: { __componentArgRef: "missing" } },
  });
  await expect(t.runInits()).rejects.toThrow(
    "Invalid argument value for component 'greeter/echo': Component 'greeter' has no argument named 'missing'.",
  );
});

test("a component without an init can't be passed args", async () => {
  const t = convexTest({ schema, componentArgs: { counter: { n: 1 } } });
  t.registerComponent("counter", counterSchema, counterModules);
  await expect(t.runInits()).rejects.toThrow(
    /Component "counter" is passed arguments, but it doesn't declare an init/,
  );
});

test("an init must be an internal mutation", async () => {
  const t = convexTest({ schema, componentArgs: { greeter: {} } });
  t.registerComponent("greeter", greeterSchema, {
    ...greeterModules,
    "./componentInit/greeter/convex.config.ts": async () => ({
      default: { _init: "public:greet" },
    }),
  });
  await expect(t.runInits()).rejects.toThrow(
    /declares public:greet as its init, but it isn't an internal mutation/,
  );
});
