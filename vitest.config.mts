import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // Don't pick up tests from nested git worktrees (e.g. Claude Code's
    // `.claude/worktrees/*`), which contain full copies of the repo.
    exclude: [...configDefaults.exclude, ".claude/**", ".context/**"],
  },
});
