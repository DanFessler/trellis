import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { trellisAliases } from "../../vite.aliases";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: trellisAliases, dedupe: ["react", "react-dom"] },
  server: { port: 5313 },
});
