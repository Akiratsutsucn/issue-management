import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: { include: ["src/lib/**/*.ts"], exclude: ["src/lib/db.ts", "src/lib/server/**"] },
  },
});
