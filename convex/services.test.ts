import { decodeJwt, decodeProtectedHeader } from "jose";
import {
  getServiceToken,
  getServiceUrl,
  httpActionGeneric,
  httpRouter,
} from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";

afterEach(() => {
  vi.useRealTimers();
});

test("actions receive a test URL and a short-lived test JWT", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T00:00:00Z"));
  const t = convexTest(schema);
  const { url, token } = await t.action(async () => ({
    url: await getServiceUrl("ai-gateway"),
    token: await getServiceToken("ai-gateway"),
  }));
  expect(url).toBe("https://ai-gateway.convex.test");
  expect(decodeProtectedHeader(token)).toEqual({ alg: "none", typ: "JWT" });
  expect(decodeJwt(token)).toEqual({
    iss: "convex-test",
    aud: "ai-gateway",
    iat: 1794441600,
    exp: 1794441900,
  });
  expect(token.endsWith(".")).toBe(true);
});

test.each([getServiceToken, getServiceUrl])(
  "service syscalls reject queries, mutations, and unsupported services",
  async (helper) => {
    const t = convexTest(schema);
    await expect(t.query(async () => helper("ai-gateway"))).rejects.toThrow(
      "Unknown async operation",
    );
    await expect(t.mutation(async () => helper("ai-gateway"))).rejects.toThrow(
      "Unknown async operation",
    );
    await expect(
      t.action(async () => helper("unknown" as "ai-gateway")),
    ).rejects.toThrow("Unsupported Convex service: unknown");
  },
);

test("HTTP actions can use service helpers", async () => {
  const router = httpRouter();
  router.route({
    path: "/service",
    method: "GET",
    handler: httpActionGeneric(
      async () =>
        new Response(
          JSON.stringify({
            url: await getServiceUrl("ai-gateway"),
            token: await getServiceToken("ai-gateway"),
          }),
        ),
    ),
  });
  const t = convexTest(schema, {
    "./_generated/server.ts": async () => ({}),
    "./http.ts": async () => ({ default: router }),
  });
  const result = await (await t.fetch("/service")).json();
  expect(result.url).toBe("https://ai-gateway.convex.test");
  expect(decodeJwt(result.token).aud).toBe("ai-gateway");
});
