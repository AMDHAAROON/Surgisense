import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "..", "shared"),
      "zod": path.resolve(__dirname, "node_modules/zod"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api':    'http://localhost:8000',
      '/stream': 'http://localhost:8000',
      '/ws':     'ws://localhost:8000',
    },
  },
});