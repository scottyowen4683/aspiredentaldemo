// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react"; // <-- remove if not using React
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  // Make the Vite "project root" the /frontend folder where this config lives
  root: __dirname,
  // Ensure the build output goes to /frontend/dist (absolute path)
  build: {
    outDir: resolve(__dirname, "dist")
  },
  plugins: [react()] // <-- remove if not using React
});
