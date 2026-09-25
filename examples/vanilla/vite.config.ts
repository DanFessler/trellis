import { resolve } from "node:path";
import { defineConfig } from "vite";
import { trellisAliases } from "../../vite.aliases";
export default defineConfig({
  base: "./",
  resolve: { alias: trellisAliases },
  server: { port: 5310 },
  build: {
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), element: resolve(__dirname, "element.html") } },
  },
});
