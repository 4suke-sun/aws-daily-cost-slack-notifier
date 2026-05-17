import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    name: "notifier",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
