import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.{test,spec}.{js,ts,jsx,tsx}"],
    // next-auth imports "next/server" without an extension; Node ESM can't resolve that,
    // so let Vite process next-auth (it resolves the subpath via next's exports).
    server: { deps: { inline: ["next-auth"] } },
    // pipeline.ts imports a route that imports auth.ts, which refuses to load without a secret.
    env: { AUTH_SECRET: "fixture-only-" + "0123456789abcdef".repeat(2) },
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "src/__tests__/setup.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
