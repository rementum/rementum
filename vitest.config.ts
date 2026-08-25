import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@rementum/contracts": path.join(root, "packages/contracts/src/index.ts"),
      "@rementum/core": path.join(root, "packages/core/src/index.ts"),
      "@rementum/db": path.join(root, "packages/db/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
