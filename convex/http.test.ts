import { expect, test } from "vitest";
import { convexTest } from "../index";
import { internal } from "./_generated/api";
import schema from "./schema";

test("simple", async () => {
  const t = convexTest(schema);
  const response = await t.fetch("/foo?arg=hello", { method: "GET" });
  expect(await response.text()).toEqual("hello");
});

test("json body", async () => {
  const t = convexTest(schema);
  const response = await t.fetch("/buzz", {
    method: "POST",
    body: JSON.stringify({ text: "hello" }),
    headers: { "Content-Type": "application/json" },
  });
  expect(await response.text()).toEqual("hello");
});

test("path prefix", async () => {
  const t = convexTest(schema);
  const response = await t.fetch("/bla/hello", { method: "POST" });
  expect(await response.text()).toEqual("hello");
});

test("http action runs query", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "mike", body: "hello" });
  });
  const response = await t.fetch("/readQuery", { method: "POST" });
  const message = await response.json();
  expect(message.body).toEqual("hello");
});

test("HTTP global patches are isolated from nested calls and later handlers", async () => {
  const t = convexTest(schema);
  const originalAtob = globalThis.atob;
  try {
    const response = await t.fetch("/globals?patch=patched-http");
    expect(await response.json()).toEqual({
      before: "patched-http",
      nested: "hello",
      after: "patched-http",
    });
    expect(globalThis.atob).toBe(originalAtob);
    expect(await t.query(internal.globals.readAtob)).toBe("hello");
    expect(await (await t.fetch("/globals")).text()).toBe("hello");
  } finally {
    globalThis.atob = originalAtob;
  }
});

test("HTTP global patches do not leak after a handler throws", async () => {
  const t = convexTest(schema);
  const originalAtob = globalThis.atob;
  try {
    expect((await t.fetch("/globals?patch=patched-error&throw")).status).toBe(
      500,
    );
    expect(globalThis.atob).toBe(originalAtob);
    expect(await (await t.fetch("/globals")).text()).toBe("hello");
  } finally {
    globalThis.atob = originalAtob;
  }
});

test("parallel HTTP handlers have isolated globals", async () => {
  const t = convexTest(schema);
  const originalAtob = globalThis.atob;
  try {
    const responses = await Promise.all([
      t.fetch("/globals?patch=first"),
      t.fetch("/globals?patch=second"),
    ]);
    expect(
      await Promise.all(responses.map((response) => response.json())),
    ).toEqual([
      { before: "first", nested: "hello", after: "first" },
      { before: "second", nested: "hello", after: "second" },
    ]);
    expect(globalThis.atob).toBe(originalAtob);
  } finally {
    globalThis.atob = originalAtob;
  }
});
