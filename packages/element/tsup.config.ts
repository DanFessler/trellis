import { defineConfig } from "tsup";
export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    external: ["@danfessler/trellis"],
  },
  {
    // A single file for <script type="module"> use without a bundler.
    entry: { "trellis-element.standalone": "src/index.ts" },
    format: ["esm"],
    minify: true,
    sourcemap: true,
    target: "es2022",
    noExternal: ["@danfessler/trellis"],
  },
]);
