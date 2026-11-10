import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import { httpAction, internalQuery } from "./_generated/server";
import { jwksFromHttpAction } from "./signJwt";

const http = httpRouter();

http.route({
  path: "/foo",
  method: "GET",
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    return new Response(url.searchParams.get("arg"), { status: 200 });
  }),
});

http.route({
  path: "/buzz",
  method: "POST",
  handler: httpAction(async (_, request) => {
    const { text } = await request.json();
    return new Response(text, { status: 200 });
  }),
});

http.route({
  pathPrefix: "/bla/",
  method: "POST",
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    const text = url.pathname.split("/").at(-1);
    return new Response(text, { status: 200 });
  }),
});

http.route({
  path: "/readQuery",
  method: "POST",
  handler: httpAction(async (ctx) => {
    const message = await ctx.runQuery(internal.http.getFirst);
    return new Response(JSON.stringify(message), { status: 200 });
  }),
});

export const getFirst = internalQuery(async (ctx) => {
  return await ctx.db.query("messages").first();
});

http.route({
  path: "/metadata",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const metadata = await ctx.meta.getFunctionMetadata();
    return new Response(JSON.stringify(metadata), { status: 200 });
  }),
});

http.route({
  path: "/requestMetadata",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const metadata = await ctx.meta.getRequestMetadata();
    const nested = await ctx.runMutation(api.requestMetadata.metadataMutation);
    return new Response(JSON.stringify({ own: metadata, nested }), {
      status: 200,
    });
  }),
});

http.route({
  path: "/globals",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const patch = url.searchParams.get("patch");
    if (patch === null) {
      return new Response(atob("aGVsbG8="));
    }
    globalThis.atob = () => patch;
    if (url.searchParams.has("throw")) {
      throw new Error("HTTP handler failed after patching globals");
    }
    const before = atob("aGVsbG8=");
    const nested = await ctx.runQuery(internal.globals.readAtob);
    return Response.json({ before, nested, after: atob("aGVsbG8=") });
  }),
});

http.route({
  path: "/deploymentJwks",
  method: "GET",
  handler: jwksFromHttpAction,
});

export default http;
