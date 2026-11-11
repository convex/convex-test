import { v } from "convex/values";
import { components } from "./_generated/api";
import { action, httpAction, mutation, query } from "./_generated/server";

// The `Convex` global stays reachable from any function, so code can make
// syscalls directly, bypassing what `ctx` exposes.
declare const Convex: {
  asyncSyscall: (op: string, jsonArgs: string) => Promise<string>;
};

async function asyncSyscall(op: string, args: unknown) {
  return JSON.parse(await Convex.asyncSyscall(op, JSON.stringify(args)));
}

export const sign = mutation({
  args: { claims: v.optional(v.any()), expiresInSeconds: v.number() },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await ctx.auth.signJwt(args);
  },
});

// Signs before and after the component does, to show the issuer follows the
// component the code runs in.
export const signAroundComponent = mutation({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const before = await ctx.auth.signJwt({
      claims: { aud: "test" },
      expiresInSeconds: 60,
    });
    const fromComponent = await ctx.runMutation(
      components.counter.signJwt.sign,
      {},
    );
    const after = await ctx.auth.signJwt({
      claims: { aud: "test" },
      expiresInSeconds: 60,
    });
    return [before, fromComponent, after];
  },
});

export const signFromQuery = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => "signJwt" in ctx.auth,
});

export const signFromAction = action({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => "signJwt" in ctx.auth,
});

export const signViaSyscall = mutation({
  args: { claims: v.optional(v.any()), expiresInSeconds: v.number() },
  returns: v.string(),
  handler: async (_ctx, args) => await asyncSyscall("1.0/signJwt", args),
});

export const signInQueryViaSyscall = query({
  args: {},
  returns: v.string(),
  handler: async () =>
    await asyncSyscall("1.0/signJwt", {
      claims: { aud: "test" },
      expiresInSeconds: 60,
    }),
});

export const signInActionViaSyscall = action({
  args: {},
  returns: v.string(),
  handler: async () =>
    await asyncSyscall("1.0/signJwt", {
      claims: { aud: "test" },
      expiresInSeconds: 60,
    }),
});

export const jwksFromQuery = query({
  args: {},
  returns: v.any(),
  handler: async () => await asyncSyscall("1.0/getDeploymentJwks", {}),
});

export const jwksFromMutation = mutation({
  args: {},
  returns: v.any(),
  handler: async () => await asyncSyscall("1.0/getDeploymentJwks", {}),
});

export const jwksFromAction = action({
  args: {},
  returns: v.any(),
  handler: async () => await asyncSyscall("1.0/getDeploymentJwks", {}),
});

export const jwksFromHttpAction = httpAction(async () =>
  Response.json(await asyncSyscall("1.0/getDeploymentJwks", {})),
);
