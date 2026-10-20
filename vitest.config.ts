import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Test-only config: the app's vite.config.ts loads nitro + Cloudflare
// plugins that break under vitest's runner, so unit tests run here with
// plain node + esbuild transform instead. The "@" alias mirrors the app
// config so server modules resolve the same way they do in the build.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
