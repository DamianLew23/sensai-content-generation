import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@sensai/shared": resolve(__dirname, "../../packages/shared/dist/index.js"),
    },
  },
});
