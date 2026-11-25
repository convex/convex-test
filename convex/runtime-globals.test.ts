import { afterEach, expect, test, vi } from "vitest";
import { componentsGeneric, defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { defineTestApp } from "../index";

const schema = defineSchema({ log: defineTable({ label: v.string() }) });
const app = defineTestApp({ schema });
const childModules = {
  probe: {
    readEnv: app.query({
      args: {},
      returns: v.union(v.string(), v.null()),
      handler: async () => process.env.PARITY_AUDIT_SECRET ?? null,
    }),
  },
};
const fixture = app.defineModules({
  m: {
    generateKey: app.mutation({
      args: {},
      returns: v.null(),
      handler: async () => {
        await crypto.subtle.generateKey(
          { name: "HMAC", hash: "SHA-256" },
          true,
          ["sign"],
        );
        return null;
      },
    }),
    systemEnv: app.query({
      args: {},
      returns: v.any(),
      handler: async () => [
        process.env.CONVEX_CLOUD_URL,
        process.env.CONVEX_SITE_URL,
      ],
    }),
    clearTimer: app.mutation({
      args: {},
      returns: v.null(),
      handler: async () => {
        clearTimeout(undefined);
        return null;
      },
    }),
    fetchCaught: app.query({
      args: {},
      returns: v.union(v.string(), v.null()),
      handler: async () =>
        await fetch("https://example.com")
          .then(() => "fetched")
          .catch(() => null),
    }),
    builtins: app.query({
      args: {},
      returns: v.any(),
      handler: async () => ({
        consoleTable: typeof console.table,
        queueMicrotask: typeof (globalThis as any).queueMicrotask,
        nextTick: typeof (process as any).nextTick,
        envKeys: Object.keys(process.env).length,
      }),
    }),
    childEnv: app.query({
      args: {},
      returns: v.union(v.string(), v.null()),
      handler: async (ctx): Promise<string | null> =>
        await ctx.runQuery(componentsGeneric().child.probe.readEnv as any, {}),
    }),
  },
});

function createTest() {
  const t = fixture.createTest();
  t.registerComponent("child", schema, {
    "./_generated/server.ts": async () => ({}),
    "./probe.ts": async () => childModules.probe,
  });
  return t;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("runtime: crypto.subtle.generateKey is not allowed in mutations", async () => {
  const t = createTest();
  await expect(t.mutation(fixture.api.m.generateKey, {})).rejects.toThrow(
    /Can't use cryptographic randomness in queries and mutations/,
  );
});

test("env: CONVEX_CLOUD_URL and CONVEX_SITE_URL are always set", async () => {
  const saved = [process.env.CONVEX_CLOUD_URL, process.env.CONVEX_SITE_URL];
  delete process.env.CONVEX_CLOUD_URL;
  delete process.env.CONVEX_SITE_URL;
  const t = createTest();
  const [cloudUrl, siteUrl] = await t
    .query(fixture.api.m.systemEnv, {})
    .finally(() => {
      if (saved[0] !== undefined) process.env.CONVEX_CLOUD_URL = saved[0];
      if (saved[1] !== undefined) process.env.CONVEX_SITE_URL = saved[1];
    });

  expect(cloudUrl).toEqual(expect.any(String));
  expect(siteUrl).toEqual(expect.any(String));
});

test("env: components only see the environment variables bound to them", async () => {
  vi.stubEnv("PARITY_AUDIT_SECRET", "app-secret");
  const t = createTest();

  expect(await t.query(fixture.api.m.childEnv, {})).toBe(null);
});

test("runtime: clearTimeout is a no-op in mutations", async () => {
  const t = createTest();

  await t.mutation(fixture.api.m.clearTimer, {});
});

test("runtime: fetch rejects asynchronously in queries", async () => {
  const t = createTest();

  expect(await t.query(fixture.api.m.fetchCaught, {})).toBe(null);
});

test("runtime: globals missing from the Convex runtime are missing in tests", async () => {
  const t = createTest();

  expect(await t.query(fixture.api.m.builtins, {})).toEqual({
    consoleTable: "undefined",
    queueMicrotask: "undefined",
    nextTick: "undefined",
    envKeys: 0,
  });
});
