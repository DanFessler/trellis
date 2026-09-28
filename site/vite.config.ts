import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { trellisAliases } from "../vite.aliases";
import { markdown } from "./plugins/markdown";

const here = path.dirname(fileURLToPath(import.meta.url));

/** In dev, serve previously built examples from dist/examples so gallery links work. */
function devExamples(): Plugin {
  const root = path.join(here, "dist/examples");
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
  };
  return {
    name: "trellis-dev-examples",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/examples", (req, res, next) => {
        const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
        let file = path.join(root, url);
        if (!file.startsWith(root)) return next();
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
        if (!fs.existsSync(file)) return next();
        res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [
    markdown({ repo: path.join(here, ".."), cacheDir: path.join(here, ".docs-cache") }),
    react(),
    devExamples(),
  ],
  resolve: { alias: trellisAliases, dedupe: ["react", "react-dom"] },
  server: { port: 5320, strictPort: true, fs: { allow: [path.join(here, "..")] } },
  preview: { port: 5320 },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
