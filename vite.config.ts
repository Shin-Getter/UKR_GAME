import { defineConfig } from "vitest/config";

// Relative base so the build works at any path (GitHub Pages serves under /<repo>/).
export default defineConfig({
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
