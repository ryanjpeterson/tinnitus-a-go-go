import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [
      "macmini",
      "macmini.local",
      "100.123.243.36",
      "stingray-octatonic",
      ".ts.net", // all Tailscale Funnel / MagicDNS subdomains
    ],
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://api:3000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      // Proxy MinIO media through the app server so all assets come from the
      // same origin. This means MINIO_PUBLIC_URL = the app base URL and media
      // works through Tailscale Funnel without exposing port 9000 publicly.
      "/tagg-media": {
        target: "http://minio:9000",
        changeOrigin: true,
      },
    },
  },
});
