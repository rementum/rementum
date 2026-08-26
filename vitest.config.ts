import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// The integration suites skip themselves without a database, so half the code under
// measurement is never loaded. Holding one floor over both runs would either fail every
// contributor who has no PostgreSQL to hand or stop guarding what CI actually exercises,
// so the floor follows the suite that ran.
const thresholds = process.env.REMENTUM_TEST_DATABASE_URL
  ? { statements: 78, branches: 68, functions: 78, lines: 81 }
  : { statements: 45, branches: 41, functions: 37, lines: 45 };

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
    // Intl formats in the runtime time zone, and no instant shares a calendar date across
    // the whole UTC-12..+14 range. Pinning the zone keeps the date assertions honest on a
    // contributor's machine as well as on the runner.
    env: { TZ: "UTC" },
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
      thresholds,
    },
  },
});
