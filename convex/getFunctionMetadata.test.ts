/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { api, components, internal } from "./_generated/api";
import counterSchema from "./counter/component/schema";

const counterModules = import.meta.glob("./counter/component/**/*.ts");

test("inline query", async () => {
  const t = convexTest({ schema });
  const metadata = await t.query(async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  });
  expect(metadata).toEqual({
    name: "inline",
    componentPath: "",
    type: "query",
    visibility: "public",
  });
});

test("inline mutation", async () => {
  const t = convexTest({ schema });
  const metadata = await t.mutation(async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  });
  expect(metadata).toEqual({
    name: "inline",
    componentPath: "",
    type: "mutation",
    visibility: "public",
  });
});

test("inline action", async () => {
  const t = convexTest({ schema });
  const metadata = await t.action(async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  });
  expect(metadata).toEqual({
    name: "inline",
    componentPath: "",
    type: "action",
    visibility: "public",
  });
});

test("named query", async () => {
  const t = convexTest({ schema });
  const metadata = await t.query(api.getFunctionMetadata.metadataQuery);
  expect(metadata).toEqual({
    name: "getFunctionMetadata:metadataQuery",
    componentPath: "",
    type: "query",
    visibility: "public",
  });
});

test("named mutation", async () => {
  const t = convexTest({ schema });
  const metadata = await t.mutation(api.getFunctionMetadata.metadataMutation);
  expect(metadata).toEqual({
    name: "getFunctionMetadata:metadataMutation",
    componentPath: "",
    type: "mutation",
    visibility: "public",
  });
});

test("named action", async () => {
  const t = convexTest({ schema });
  const metadata = await t.action(api.getFunctionMetadata.metadataAction);
  expect(metadata).toEqual({
    name: "getFunctionMetadata:metadataAction",
    componentPath: "",
    type: "action",
    visibility: "public",
  });
});

test("internal query", async () => {
  const t = convexTest({ schema });
  const metadata = await t.query(
    internal.getFunctionMetadata.internalMetadataQuery,
  );
  expect(metadata).toEqual({
    name: "getFunctionMetadata:internalMetadataQuery",
    componentPath: "",
    type: "query",
    visibility: "internal",
  });
});

test("internal mutation", async () => {
  const t = convexTest({ schema });
  const metadata = await t.mutation(
    internal.getFunctionMetadata.internalMetadataMutation,
  );
  expect(metadata).toEqual({
    name: "getFunctionMetadata:internalMetadataMutation",
    componentPath: "",
    type: "mutation",
    visibility: "internal",
  });
});

test("internal action", async () => {
  const t = convexTest({ schema });
  const metadata = await t.action(
    internal.getFunctionMetadata.internalMetadataAction,
  );
  expect(metadata).toEqual({
    name: "getFunctionMetadata:internalMetadataAction",
    componentPath: "",
    type: "action",
    visibility: "internal",
  });
});

test("internal functions called from an action", async () => {
  const t = convexTest({ schema });
  const metadata = await t.action(
    api.getFunctionMetadata.nestedInternalMetadata,
  );
  expect(metadata).toEqual([
    {
      name: "getFunctionMetadata:internalMetadataQuery",
      componentPath: "",
      type: "query",
      visibility: "internal",
    },
    {
      name: "getFunctionMetadata:internalMetadataMutation",
      componentPath: "",
      type: "mutation",
      visibility: "internal",
    },
    {
      name: "getFunctionMetadata:internalMetadataAction",
      componentPath: "",
      type: "action",
      visibility: "internal",
    },
  ]);
});

test("default export", async () => {
  const t = convexTest({ schema });
  const metadata = await t.query(api.getFunctionMetadata.default);
  expect(metadata).toEqual({
    name: "getFunctionMetadata",
    componentPath: "",
    type: "query",
    visibility: "public",
  });
});

test("http action", async () => {
  const t = convexTest(schema);
  const response = await t.fetch("/metadata", { method: "GET" });
  const metadata = await response.json();
  expect(metadata).toEqual({
    name: "http",
    componentPath: "",
    type: "action",
    visibility: "public",
  });
});

test("component function has component path", async () => {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  const metadata = await t.query(components.counter.public.metadata);
  expect(metadata).toEqual({
    name: "public:metadata",
    componentPath: "counter",
    type: "query",
    visibility: "public",
  });
});
