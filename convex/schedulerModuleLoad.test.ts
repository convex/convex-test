// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const realSetImmediate = globalThis.setImmediate;

async function afterEventLoopTurns(turns: number): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await new Promise<void>((resolve) => realSetImmediate(resolve));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("finishes scheduled functions with slow module loads", async () => {
  const t = convexTest(schema, {
    ...modules,
    "./scheduler.ts": async () => {
      await afterEventLoopTurns(12_000);
      return await import("./scheduler");
    },
  });
  await t.mutation(async (ctx) => {
    await ctx.scheduler.runAfter(0, api.scheduler.add, {
      body: "through a slow module load",
      author: "AI",
    });
  });

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const messages = await t.query((ctx) => ctx.db.query("messages").collect());
  expect(messages).toMatchObject([
    { body: "through a slow module load", author: "AI" },
  ]);
});
