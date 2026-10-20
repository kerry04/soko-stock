import { defineConfig } from "vitest/config";

// Test-only config: the app's vite.config.ts loads nitro + Cloudflare
// plugins that break under vitest's runner, so unit tests run here with
// plain node + esbuild transform instead.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/paper/**/*.test.ts"],
  },
});
