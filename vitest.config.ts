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
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      // React components are left out: the suite has no DOM environment, so the ones worth
      // asserting on are covered through renderToStaticMarkup instead of a coverage floor.
      include: [
        "apps/*/src/**/*.ts",
        "apps/web/app/**/*.ts",
        "apps/web/lib/**/*.ts",
        "packages/*/src/**/*.ts",
      ],
      // Process entrypoints connect, listen, or start their loop while being imported, so a
      // test cannot load them. Their logic has to be extracted before it can be covered.
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "apps/api/src/admin.ts",
        "apps/api/src/generate-jwks.ts",
        "apps/api/src/server.ts",
        "apps/embeddings/src/server.ts",
        "apps/web/lib/site.ts",
        "apps/worker/src/worker.ts",
        "packages/*/src/index.ts",
        "packages/core/src/types.ts",
        "packages/db/src/migrate.ts",
      ],
    },
  },
});
