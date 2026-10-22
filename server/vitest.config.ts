import { defineConfig } from "vitest/config";

process.env.DB_DATA_DIR = ":memory:";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 25000,
    globals: true,
  },
});
