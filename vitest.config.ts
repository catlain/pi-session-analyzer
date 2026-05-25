import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // mock 替代 @pi-atelier/shared-utils 的 tool-output
      "@pi-atelier/shared-utils": path.resolve(__dirname, "tests/__mocks__/tool-output.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 10000,
  },
});
