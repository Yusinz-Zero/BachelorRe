import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite dev server for the React UI (RevivalSide-style).
// - browser dev:  http://127.0.0.1:5173  (proxies /api -> ui-server :5178)
// - Tauri dev:    same server via beforeDevCommand
// - production:   `vite build` -> dist/ (served by ui-server as fallback, and
//                 embedded in the Tauri shell via frontendDist)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:5178", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
