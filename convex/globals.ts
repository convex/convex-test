import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

// A mutation that patches a global, calls a nested query, then checks
// that the patch is still visible after the nested call returns.
export const mutationPatchingGlobal = internalMutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ before: string; nested: string; after: string }> => {
    const original = globalThis.atob;
    // Patch atob to a sentinel
    (globalThis as any).atob = () => "patched-by-mutation";
    try {
      // atob should be patched here
      const before = globalThis.atob("ignored");

      // Nested query — should see the REAL atob, not the patched one
      const nested = await ctx.runQuery(internal.globals.readAtob);

      // After nested call, patched atob should be restored
      const after = globalThis.atob("ignored");

      return { before, nested, after };
    } finally {
      // Clean up just in case — though the framework should restore it.
      (globalThis as any).atob = original;
    }
  },
});

export const readAtob = internalQuery({
  args: {},
  handler: async (): Promise<string> => {
    // Call atob with a valid base64 string to see if it's real or patched
    return globalThis.atob("aGVsbG8="); // "hello"
  },
});

export const consumeRandom = internalMutation({
  args: {},
  returns: v.number(),
  handler: async () => Math.random(),
});

export const readTime = internalQuery({
  args: {},
  returns: v.number(),
  handler: () => Date.now(),
});

export const readGlobalType = internalQuery({
  args: { name: v.string() },
  returns: v.string(),
  handler: async (_ctx, { name }) =>
    typeof (globalThis as Record<string, unknown>)[name],
});

// An action that patches a global, calls a nested mutation, and verifies isolation
export const actionPatchingGlobal = internalAction({
  args: {},
  handler: async (ctx) => {
    (globalThis as any).atob = () => "patched-by-action";

    const before = globalThis.atob("ignored");

    // Nested mutation should see real atob
    const nested: string = await ctx.runMutation(
      internal.globals.nestedMutationReadAtob,
    );

    // After nested call, patch should still be visible
    const after = globalThis.atob("ignored");

    return { before, nested, after };
  },
});

export const nestedMutationReadAtob = internalMutation({
  args: {},
  handler: async () => {
    return globalThis.atob("aGVsbG8="); // "hello"
  },
});

// An action that patches a global then calls another action that also patches it
export const actionPatchingGlobalNested = internalAction({
  args: {},
  handler: async (ctx) => {
    (globalThis as any).atob = () => "patched-by-outer";

    const outerBefore = globalThis.atob("ignored");

    // Inner action patches atob to something else
    const inner: { before: string; after: string } = await ctx.runAction(
      internal.globals.innerActionPatchingGlobal,
    );

    // Outer should still see its own patch
    const outerAfter = globalThis.atob("ignored");

    return { outerBefore, inner, outerAfter };
  },
});

export const innerActionPatchingGlobal = internalAction({
  args: {},
  handler: async () => {
    // Should start with real atob (not outer's patch)
    const before = globalThis.atob("aGVsbG8="); // "hello"

    (globalThis as any).atob = () => "patched-by-inner";
    const after = globalThis.atob("ignored");

    return { before, after };
  },
});

// Two actions that run concurrently, each patching the same global differently.
// Used to verify ALS isolation between parallel actions.
export const actionPatchA = action({
  args: { delayMs: v.number() },
  handler: async () => {
    (globalThis as any).atob = () => "patched-A";

    // Small delay so both actions overlap
    await new Promise((r) => setTimeout(r, 10));

    // Should still see our own patch, not the other action's
    return globalThis.atob("ignored");
  },
});

export const actionPatchB = action({
  args: { delayMs: v.number() },
  handler: async () => {
    (globalThis as any).atob = () => "patched-B";

    await new Promise((r) => setTimeout(r, 10));

    return globalThis.atob("ignored");
  },
});

// Verify globals are clean after a handler that patched them
export const readAtobAction = internalAction({
  args: {},
  handler: async () => {
    return globalThis.atob("aGVsbG8="); // "hello"
  },
});

// Functions that attempt to use globals disallowed in transactions.
export const queryUsingFetch = internalQuery({
  args: {},
  handler: async () => {
    await fetch("https://example.com");
    return null;
  },
});

export const mutationUsingFetch = internalMutation({
  args: {},
  handler: async () => {
    await fetch("https://example.com");
    return null;
  },
});

export const mutationUsingSetTimeout = internalMutation({
  args: {},
  handler: async () => {
    setTimeout(() => {}, 0);
    return null;
  },
});

export const queryUsingSetInterval = internalQuery({
  args: {},
  handler: async () => {
    setInterval(() => {}, 0);
    return null;
  },
});

// User-supplied fetch override should win over the disallowed sentinel.
export const mutationOverridingFetch = internalMutation({
  args: {},
  handler: async () => {
    (globalThis as any).fetch = async () =>
      new Response(JSON.stringify({ ok: true }));
    const res = await fetch("https://example.com");
    return await res.text();
  },
});

// Action that uses fetch — should still be allowed (we only restrict in
// transactions). Hits localhost so we don't depend on the network.
export const actionUsingSetTimeout = internalAction({
  args: {},
  handler: async () => {
    await new Promise((r) => setTimeout(r, 1));
    return "ok";
  },
});
