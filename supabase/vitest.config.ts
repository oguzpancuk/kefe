import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The CLI call and the stack's first answers are slower than a unit test.
    testTimeout: 60_000,
  },
});
