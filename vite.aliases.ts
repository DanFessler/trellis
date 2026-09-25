import { fileURLToPath } from "node:url";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Examples and the site build against package sources, not dist. */
export const trellisAliases = [
  { find: "@danfessler/trellis/style.css", replacement: here("./packages/core/src/style.css") },
  { find: /^@danfessler\/trellis$/, replacement: here("./packages/core/src/index.ts") },
  { find: /^@danfessler\/trellis-react$/, replacement: here("./packages/react/src/index.ts") },
  { find: /^@danfessler\/trellis-element$/, replacement: here("./packages/element/src/index.ts") },
];
