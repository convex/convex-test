/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    callbacks: {
      invoke: FunctionReference<
        "mutation",
        "internal",
        { fail?: boolean; handle: string; key: string },
        null,
        Name
      >;
    };
    public: {
      add: FunctionReference<
        "mutation",
        "internal",
        { count: number; name: string; shards?: number },
        null,
        Name
      >;
      addWithCommitTs: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        any,
        Name
      >;
      count: FunctionReference<
        "query",
        "internal",
        { name: string },
        number,
        Name
      >;
      countAction: FunctionReference<
        "action",
        "internal",
        { name: string },
        number,
        Name
      >;
      countMany: FunctionReference<
        "action",
        "internal",
        { names: Array<string> },
        Array<number>,
        Name
      >;
      getCommitTs: FunctionReference<
        "query",
        "internal",
        { name: string },
        any,
        Name
      >;
      getIdentityName: FunctionReference<"query", "internal", {}, any, Name>;
      getIdentityNameAction: FunctionReference<
        "action",
        "internal",
        {},
        any,
        Name
      >;
      metadata: FunctionReference<"query", "internal", {}, any, Name>;
      mutationWithNestedQuery: FunctionReference<
        "mutation",
        "internal",
        {},
        any,
        Name
      >;
      mutationWithNumberArg: FunctionReference<
        "mutation",
        "internal",
        { a: number },
        any,
        Name
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      requestMetadata: FunctionReference<"mutation", "internal", {}, any, Name>;
      requestMetadataAction: FunctionReference<
        "action",
        "internal",
        {},
        any,
        Name
      >;
      schedule: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        any,
        Name
      >;
      snapshot: FunctionReference<"query", "internal", {}, bigint, Name>;
    };
    signJwt: {
      sign: FunctionReference<"mutation", "internal", {}, string, Name>;
    };
  };
