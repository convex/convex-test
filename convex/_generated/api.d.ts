/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as argumentsValidation from "../argumentsValidation.js";
import type * as auditLogging from "../auditLogging.js";
import type * as authentication from "../authentication.js";
import type * as commitTs from "../commitTs.js";
import type * as component from "../component.js";
import type * as convexError from "../convexError.js";
import type * as explicitTableNames from "../explicitTableNames.js";
import type * as getDeploymentMetadata from "../getDeploymentMetadata.js";
import type * as getFunctionMetadata from "../getFunctionMetadata.js";
import type * as getSnapshotTs from "../getSnapshotTs.js";
import type * as globals from "../globals.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as mutations from "../mutations.js";
import type * as nestedLimits from "../nestedLimits.js";
import type * as pagination from "../pagination.js";
import type * as queries from "../queries.js";
import type * as requestMetadata from "../requestMetadata.js";
import type * as requestMetadataNode from "../requestMetadataNode.js";
import type * as returnsValidation from "../returnsValidation.js";
import type * as scheduler from "../scheduler.js";
import type * as signJwt from "../signJwt.js";
import type * as storage from "../storage.js";
import type * as textSearch from "../textSearch.js";
import type * as vectorSearch from "../vectorSearch.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  argumentsValidation: typeof argumentsValidation;
  auditLogging: typeof auditLogging;
  authentication: typeof authentication;
  commitTs: typeof commitTs;
  component: typeof component;
  convexError: typeof convexError;
  explicitTableNames: typeof explicitTableNames;
  getDeploymentMetadata: typeof getDeploymentMetadata;
  getFunctionMetadata: typeof getFunctionMetadata;
  getSnapshotTs: typeof getSnapshotTs;
  globals: typeof globals;
  helpers: typeof helpers;
  http: typeof http;
  messages: typeof messages;
  mutations: typeof mutations;
  nestedLimits: typeof nestedLimits;
  pagination: typeof pagination;
  queries: typeof queries;
  requestMetadata: typeof requestMetadata;
  requestMetadataNode: typeof requestMetadataNode;
  returnsValidation: typeof returnsValidation;
  scheduler: typeof scheduler;
  signJwt: typeof signJwt;
  storage: typeof storage;
  textSearch: typeof textSearch;
  vectorSearch: typeof vectorSearch;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  counter: import("../counter/component/_generated/component.js").ComponentApi<"counter">;
  counter2: import("../counter/component/_generated/component.js").ComponentApi<"counter2">;
};
