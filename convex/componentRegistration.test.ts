import { expect, expectTypeOf, test, vi } from "vitest";
import {
  type ApiFromModules,
  type GenericSchema,
  type SchemaDefinition,
  defineSchema,
} from "convex/server";
import { v } from "convex/values";
import {
  defineTestApp,
  type ComponentRegistration,
  type TestConvex,
  type TestConvexRoot,
} from "../index";
import counterTest, { type ComponentApi, register } from "./counter/test";
import * as counterTestNamespace from "./counter/test";

const schema = defineSchema({});

// Match existing component entrypoints without the API annotation.
function legacyRegister<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(t: TestConvex<Schema>, name = "counter") {
  counterTest.register(t, name);
}

test("infers component APIs from testing exports and uses them in fixture functions", async () => {
  const app = defineTestApp({
    schema,
    components: {
      counter: counterTest,
      renamed: { register },
      namespace: counterTestNamespace,
    },
  });
  expectTypeOf(app.components.counter).toEqualTypeOf<ComponentApi<"counter">>();
  expectTypeOf(app.components.renamed).toEqualTypeOf<ComponentApi<"renamed">>();
  expectTypeOf(app.components.namespace).toEqualTypeOf<
    ComponentApi<"namespace">
  >();

  const { api, createTest } = app.defineModules({
    test: {
      increment: app.mutation({
        args: { name: v.string() },
        returns: v.number(),
        handler: async (ctx, { name }) => {
          await ctx.runMutation(app.components.counter.public.add, {
            name,
            count: 1,
          });
          return await ctx.runQuery(app.components.counter.public.count, {
            name,
          });
        },
      }),
    },
  });
  const t = createTest();
  expect(await t.mutation(api.test.increment, { name: "beans" })).toBe(1);
  expect(
    await t.query(app.components.renamed.public.count, { name: "beans" }),
  ).toBe(0);
  const counts = await t.action(app.components.counter.public.countMany, {
    names: ["beans"],
  });
  expectTypeOf(counts).toEqualTypeOf<number[]>();
  expect(counts).toEqual([1]);
  expect(
    await t.query(app.components.namespace.public.count, { name: "beans" }),
  ).toBe(0);
});

test("calls registration helpers for each fresh instance using the configured names", async () => {
  const registration = {
    register: counterTest.register,
  };
  const register = vi.spyOn(registration, "register");
  const app = defineTestApp({
    schema,
    components: { first: registration, second: registration },
  });
  const { createTest } = app.defineModules({});
  expect(register).not.toHaveBeenCalled();
  const first = createTest();
  const second = createTest();
  expect(register).toHaveBeenCalledTimes(4);
  expect(register).toHaveBeenNthCalledWith(1, first, "first");
  expect(register).toHaveBeenNthCalledWith(2, first, "second");
  expect(register).toHaveBeenNthCalledWith(3, second, "first");
  expect(register).toHaveBeenNthCalledWith(4, second, "second");

  await first.mutation(app.components.first.public.add, {
    name: "beans",
    count: 3,
  });
  await first.mutation(app.components.second.public.add, {
    name: "beans",
    count: 5,
  });
  expect(
    await first.query(app.components.first.public.count, { name: "beans" }),
  ).toBe(3);
  expect(
    await first.query(app.components.second.public.count, { name: "beans" }),
  ).toBe(5);
  expect(
    await second.query(app.components.first.public.count, { name: "beans" }),
  ).toBe(0);
  expect(
    await second.query(app.components.second.public.count, { name: "beans" }),
  ).toBe(0);
});

test("registration returns usable references for default and renamed top-level instances", async () => {
  const t = defineTestApp({ schema }).defineModules({}).createTest();
  const counter = register(t);
  const renamed = register(t, "renamed");
  expectTypeOf(counter).toEqualTypeOf<ComponentApi>();
  await t.mutation(renamed.public.add, { name: "beans", count: 4 });
  expect(await t.query(renamed.public.count, { name: "beans" })).toBe(4);
  expect(await t.query(counter.public.count, { name: "beans" })).toBe(0);
});

test("accepts and composes existing registration signatures", async () => {
  const broad = (
    t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
    name?: string,
  ) => {
    legacyRegister(t, name);
  };
  const anySchema = (t: TestConvex<any>, name?: string) => {
    broad(t, name);
  };
  const anyModel = (t: TestConvexRoot<any>, name?: string) => {
    anySchema(t, name);
  };
  const requiredName = (t: TestConvexRoot<any>, name: string) => {
    anyModel(t, name);
  };
  // Assignment checks compatibility before the API type is supplied by a cast.
  const helpers: ComponentRegistration<ComponentApi>[] = [
    legacyRegister,
    broad,
    anySchema,
    anyModel,
    requiredName,
  ];
  for (const register of helpers) {
    const app = defineTestApp({
      schema,
      components: { renamed: { register } },
    });
    expectTypeOf(app.components.renamed).toEqualTypeOf<
      ComponentApi<"renamed">
    >();
    const t = app.defineModules({}).createTest();
    await t.mutation(app.components.renamed.public.add, {
      name: "beans",
      count: 1,
    });
    expect(
      await t.query(app.components.renamed.public.count, { name: "beans" }),
    ).toBe(1);
  }
});

test("accepts assertions for existing unannotated helpers", async () => {
  const legacyHelper = { register: legacyRegister };
  const app = defineTestApp({
    schema,
    components: {
      sampleComponent: {
        register: legacyHelper.register as ComponentRegistration<ComponentApi>,
      },
    },
  });
  expectTypeOf(app.components.sampleComponent).toEqualTypeOf<
    ComponentApi<"sampleComponent">
  >();
  const t = app.defineModules({}).createTest();
  await t.mutation(app.components.sampleComponent.public.add, {
    name: "beans",
    count: 2,
  });
  expect(
    await t.query(app.components.sampleComponent.public.count, {
      name: "beans",
    }),
  ).toBe(2);
});

test("custom registration callbacks install nested dependencies under renamed parents", async () => {
  // These references are relative to the component in which the handler runs.
  const parent = defineTestApp({
    schema: counterTest.schema,
    components: { nested: counterTest },
  });
  const forward = parent.mutation({
    args: { name: v.string(), count: v.number() },
    returns: v.number(),
    handler: async (ctx, args) => {
      await ctx.runMutation(parent.components.nested.public.add, args);
      return await ctx.runQuery(parent.components.nested.public.count, {
        name: args.name,
      });
    },
  });
  const register: ComponentRegistration<
    ApiFromModules<{ nested: { forward: typeof forward } }>
  > = (t, name = "parent") => {
    t.registerComponent(name, counterTest.schema, {
      ...counterTest.modules,
      "./component/nested.ts": async () => ({ forward }),
    });
    counterTest.register(t, `${name}/nested`);
  };
  const app = defineTestApp({ schema, components: { renamed: { register } } });
  const { createTest } = app.defineModules({});
  const t = createTest();
  expect(
    await t.mutation(app.components.renamed.nested.forward, {
      name: "beans",
      count: 3,
    }),
  ).toBe(3);
  expect(
    await t.mutation(app.components.renamed.nested.forward, {
      name: "beans",
      count: 2,
    }),
  ).toBe(5);
  expect(
    await createTest().mutation(app.components.renamed.nested.forward, {
      name: "beans",
      count: 1,
    }),
  ).toBe(1);
});

test("registration failures propagate without affecting later test instances", async () => {
  const registration = {
    register: counterTest.register,
  };
  vi.spyOn(registration, "register").mockImplementationOnce(() => {
    throw new Error("registration failed");
  });
  const app = defineTestApp({ schema, components: { counter: registration } });
  const { createTest } = app.defineModules({});
  expect(createTest).toThrow("registration failed");
  const t = createTest();
  expect(
    await t.query(app.components.counter.public.count, { name: "beans" }),
  ).toBe(0);
});

test.each(["", "parent/nested"])(
  "rejects invalid top-level component name %j",
  (name) => {
    expect(() =>
      defineTestApp({ schema, components: { [name]: counterTest } }),
    ).toThrow("Invalid component instance name");
  },
);

test("component references retain their argument, result, and function types", () => {
  const app = defineTestApp({ schema, components: { counter: counterTest } });
  const checkTypes = async () => {
    const t = app.defineModules({}).createTest();
    // @ts-expect-error Only configured component names are available.
    void app.components.missing;
    // @ts-expect-error Only functions in the component API are available.
    void app.components.counter.public.missing;
    await t.mutation(app.components.counter.public.add, {
      name: "beans",
      // @ts-expect-error Component mutation arguments remain typed.
      count: "bad",
    });
    // @ts-expect-error Required arguments cannot be omitted.
    await t.query(app.components.counter.public.count);
    // @ts-expect-error Component mutations cannot be called as queries.
    await t.query(app.components.counter.public.add, {
      name: "beans",
      count: 1,
    });
    // @ts-expect-error Component query results retain their return types.
    const bad: string = await t.query(app.components.counter.public.count, {
      name: "beans",
    });
    void bad;
    // @ts-expect-error An application with no components has no named references.
    void defineTestApp({ schema }).components.counter;

    const untyped = defineTestApp({
      schema,
      components: { counter: { register: legacyRegister } },
    });
    // @ts-expect-error An unannotated helper must not silently produce an any API.
    void untyped.components.counter.public.count;
  };
  void checkTypes;
});
