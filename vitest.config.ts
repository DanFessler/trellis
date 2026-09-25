import { defineConfig } from "vitest/config";
import { trellisAliases } from "./vite.aliases";
export default defineConfig({
  resolve: { alias: trellisAliases },
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
    environment: "node",
    environmentMatchGlobs: [["packages/*/test/**/*.dom.test.{ts,tsx}", "jsdom"]],
  },
});
