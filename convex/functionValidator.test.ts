import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

test("v.function() accepts function handles", async () => {
  const t = convexTest(schema);
  const handle = await t.mutation(api.functionValidator.createHandle, {});
  expect(handle).toMatch(/^function:\/\//);
  expect(
    await t.mutation(api.functionValidator.callHandle, { onComplete: handle }),
  ).toBeNull();
  expect(await t.mutation(api.functionValidator.storeHandle, { handle })).toBe(
    handle,
  );
});

test("v.function() rejects non-handle arguments", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(api.functionValidator.callHandle, {
      onComplete: "functionValidator:target" as any,
    }),
  ).rejects.toThrowError("Validator error");
  await expect(
    t.mutation(api.functionValidator.callHandle, { onComplete: 1 as any }),
  ).rejects.toThrowError("Validator error");
});

test("v.optional(v.function())", async () => {
  const t = convexTest(schema);
  expect(await t.query(api.functionValidator.acceptsOptionalHandle, {})).toBe(
    "ok",
  );
  await expect(
    t.query(api.functionValidator.acceptsOptionalHandle, {
      handle: "nope" as any,
    }),
  ).rejects.toThrowError("Validator error");
});

test("v.function() return validation", async () => {
  const t = convexTest(schema);
  await expect(
    t.query(api.functionValidator.returnsBadHandle, {}),
  ).rejects.toThrowError("Validator error");
});

test("v.function() schema validation", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(api.functionValidator.storeHandle, { handle: "nope" }),
  ).rejects.toThrowError("Validator error");
});
