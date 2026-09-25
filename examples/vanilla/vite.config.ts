import { defineConfig } from "vite";
import { trellisAliases } from "../../vite.aliases";
export default defineConfig({ resolve: { alias: trellisAliases }, server: { port: 5310 } });
