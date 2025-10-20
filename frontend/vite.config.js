// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react"; // remove if not using React
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: __dirname,                           // <- tells Vite the project root is /frontend
  build: { outDir: resolve(__dirname, "dist") }, // <- output to /frontend/dist
  plugins: [react()],                        // remove if not React
});
