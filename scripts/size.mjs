// Prints the published bundles' minified + gzipped sizes, the figures the docs quote.
// Run after `npm run build`.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";

const entries = [
  ["@danfessler/trellis", "packages/core/dist/index.js"],
  ["@danfessler/trellis-react", "packages/react/dist/index.js"],
  ["@danfessler/trellis-element", "packages/element/dist/index.js"],
  ["stylesheet", "packages/core/dist/style.css"],
];
for (const [name, file] of entries) {
  const result = await build({ entryPoints: [file], minify: true, write: false, logLevel: "error" });
  const bytes = result.outputFiles[0].contents;
  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  console.log(
    `${name.padEnd(30)} ${kb(bytes.length).padStart(9)} min  ${kb(gzipSync(bytes, { level: 9 }).length).padStart(8)} min+gzip`,
  );
}
