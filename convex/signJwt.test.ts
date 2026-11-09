/// <reference types="vite/client" />

import {
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
} from "jose";
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { api, components } from "./_generated/api";
import counterSchema from "./counter/component/schema";

const counterModules = import.meta.glob("./counter/component/**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("signs an ES256 token with the given claims", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.500Z"));
  const t = convexTest(schema);
  const token = await t.mutation(api.signJwt.sign, {
    claims: { sub: "user123", aud: "my-app", role: "admin" },
    expiresInSeconds: 60,
  });
  const issuedAt = Date.UTC(2026, 0, 1) / 1000;
  expect(decodeJwt(token)).toEqual({
    sub: "user123",
    aud: "my-app",
    role: "admin",
    iss: "https://some-deployment.convex.cloud",
    iat: issuedAt,
    exp: issuedAt + 60,
  });
  expect(decodeProtectedHeader(token)).toEqual({
    alg: "ES256",
    typ: "JWT",
    kid: expect.any(String),
  });
});

test("claims are optional", async () => {
  const t = convexTest(schema);
  const token = await t.mutation(api.signJwt.sign, { expiresInSeconds: 1 });
  expect(Object.keys(decodeJwt(token)).sort()).toEqual(["exp", "iat", "iss"]);
});

test("available in inline mutations and t.run", async () => {
  const t = convexTest(schema);
  const fromMutation = await t.mutation((ctx) =>
    ctx.auth.signJwt({ expiresInSeconds: 60 }),
  );
  const fromRun = await t.run((ctx) =>
    ctx.auth.signJwt({ expiresInSeconds: 60 }),
  );
  expect(decodeJwt(fromMutation).iss).toEqual(decodeJwt(fromRun).iss);
});

test("not available in queries or actions", async () => {
  const t = convexTest(schema);
  expect(await t.query(api.signJwt.signFromQuery)).toBe(false);
  expect(await t.action(api.signJwt.signFromAction)).toBe(false);
});

test("tokens verify against t.jwks()", async () => {
  const t = convexTest(schema);
  const token = await t.mutation(api.signJwt.sign, {
    claims: { sub: "user123" },
    expiresInSeconds: 60,
  });
  const jwks = await t.jwks();
  expect(jwks).toEqual({
    keys: [
      {
        kty: "EC",
        crv: "P-256",
        x: expect.any(String),
        y: expect.any(String),
        kid: decodeProtectedHeader(token).kid,
        alg: "ES256",
        use: "sig",
      },
    ],
  });
  const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
    issuer: "https://some-deployment.convex.cloud",
    algorithms: ["ES256"],
  });
  expect(payload.sub).toEqual("user123");
  // Accessors derived from `t` share its key.
  expect(await t.withIdentity({ name: "Sarah" }).jwks()).toEqual(jwks);
});

test("each convexTest instance has its own key", async () => {
  const t1 = convexTest(schema);
  const t2 = convexTest(schema);
  const token = await t1.mutation(api.signJwt.sign, { expiresInSeconds: 60 });
  await expect(
    jwtVerify(token, createLocalJWKSet(await t2.jwks())),
  ).rejects.toThrow();
});

test("issuer is CONVEX_CLOUD_URL", async () => {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://happy-animal-123.convex.cloud/");
  const t = convexTest(schema);
  const token = await t.mutation(api.signJwt.sign, { expiresInSeconds: 60 });
  expect(decodeJwt(token).iss).toEqual("https://happy-animal-123.convex.cloud");
});

test("components sign under their own issuer", async () => {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  const token = await t.mutation(components.counter.signJwt.sign, {});
  expect(decodeJwt(token).iss).toEqual(
    "https://some-deployment.convex.cloud/components/counter",
  );
});

test("the app calling a component signs under each one's issuer", async () => {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  const tokens = await t.mutation(api.signJwt.signAroundComponent);
  expect(tokens.map((token) => decodeJwt(token).iss)).toEqual([
    "https://some-deployment.convex.cloud",
    "https://some-deployment.convex.cloud/components/counter",
    "https://some-deployment.convex.cloud",
  ]);
});

test("lifetime is truncated to whole seconds", async () => {
  const t = convexTest(schema);
  const token = await t.mutation(api.signJwt.sign, {
    expiresInSeconds: 3600.9,
  });
  const { iat, exp } = decodeJwt(token);
  expect(exp! - iat!).toEqual(3600);
});

test.each([
  [
    { expiresInSeconds: 0.5 },
    "Invalid arguments for auth.signJwt: expiresInSeconds must be a number of seconds, at least 1",
  ],
  [
    { expiresInSeconds: 3601 },
    "expiresIn must be between 1 second and 3600 seconds",
  ],
  [
    { claims: { iss: "me" }, expiresInSeconds: 60 },
    "The 'iss' claim is set by Convex and can't be provided",
  ],
  [
    { claims: { exp: 1 }, expiresInSeconds: 60 },
    "The 'exp' claim is set by Convex and can't be provided",
  ],
  [
    { claims: { nbf: 1 }, expiresInSeconds: 60 },
    "The 'nbf' claim is reserved by Convex and can't be provided",
  ],
  [
    { claims: { CvxRole: "admin" }, expiresInSeconds: 60 },
    "The 'CvxRole' claim can't be provided: claim names starting with 'convex' or 'cvx' are reserved",
  ],
  [
    { claims: { convex_thing: 1 }, expiresInSeconds: 60 },
    "The 'convex_thing' claim can't be provided",
  ],
  [
    { claims: { sub: "" }, expiresInSeconds: 60 },
    "The 'sub' claim must be a non-empty string",
  ],
  [
    { claims: { sub: 123 }, expiresInSeconds: 60 },
    "The 'sub' claim must be a non-empty string",
  ],
  [{ claims: { big: "x".repeat(8000) }, expiresInSeconds: 60 }, "byte limit"],
])("rejects %j", async (args, message) => {
  const t = convexTest(schema);
  await expect(t.mutation(api.signJwt.sign, args)).rejects.toThrow(message);
});
