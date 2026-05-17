/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    globals: true,
    name: "CDK-test",
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
