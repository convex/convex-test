import { expect, test } from "vitest";
import {
  defineSchema,
  defineTable,
  httpActionGeneric,
  httpRouter,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { defineTestApp } from "../index";

const http = httpRouter();
http.route({
  path: "/webhook",
  method: "POST",
  handler: httpActionGeneric(async (_ctx, request) => {
    const body = await request.text();
    if (body !== "signed") {
      throw new ConvexError({ reason: "bad signature" });
    }
    return new Response("ok");
  }),
});

const app = defineTestApp({
  schema: defineSchema({ log: defineTable({ label: v.string() }) }),
});
const fixture = app.defineModules({ http: { default: http } });

test("http: a throwing HTTP action responds with a 500 JSON error", async () => {
  const t = fixture.createTest();
  const response = await t.fetch("/webhook", { method: "POST", body: "x" });

  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body.code).toMatch(/Server Error/);
  expect(body.data).toEqual({ reason: "bad signature" });
});

test("http: methods are matched case-insensitively", async () => {
  const t = fixture.createTest();
  const response = await t.fetch("/webhook", {
    method: "post",
    body: "signed",
  });

  expect(response.status).toBe(200);
});
