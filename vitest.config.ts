import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // The real `server-only` package throws on import outside an RSC; under the
      // node test env that would break any `*Server` module test. Stub it (ADR 0022).
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["features/**/*.test.ts", "shared/**/*.test.ts"],
    environment: "node",
  },
});
