import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
