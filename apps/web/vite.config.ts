import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The server serves the production build; in dev we proxy API + webhook calls
// to the backend so the Mini App works from a single origin (like production).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/webhook": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
