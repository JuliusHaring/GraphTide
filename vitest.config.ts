import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
