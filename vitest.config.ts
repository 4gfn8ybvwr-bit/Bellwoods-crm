import path from "path";
import { defineConfig } from "vitest/config";

process.env.DATABASE_URL = "file:./test.db";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 30000,
    testTimeout: 30000,
    globalSetup: "./tests/global-setup.ts",
    env: {
      DATABASE_URL: "file:./test.db",
      SESSION_SECRET: "test-secret-test-secret-test-secret",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
