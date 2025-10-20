// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  base: "./",                                // ✅ ensures relative asset paths on Netlify
  root: __dirname,                           // project root is /frontend
  build: {
    outDir: resolve(__dirname, "dist"),      // output to /frontend/dist
    emptyOutDir: true,
  },
  css: {
    // Vite auto-detects postcss.config.cjs at root, but we point explicitly to be safe
    postcss: resolve(__dirname, "postcss.config.cjs"),
  },
  plugins: [react()],
});
