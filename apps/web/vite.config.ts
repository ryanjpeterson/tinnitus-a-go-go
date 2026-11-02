import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

// The app's jimbo-ui.json, for the About tab of the jimbo-ui config section.
const jimboUiFile = path.resolve(__dirname, "../../jimbo-ui.json");
const jimboUiJson = existsSync(jimboUiFile) ? JSON.parse(readFileSync(jimboUiFile, "utf8")) : {};

export default defineConfig({
  // Build date as YYYY.MM.DD, shown on the account page — replaces a footer
  // version string that had to be bumped by hand and kept going stale.
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 10).replace(/-/g, ".")),
    __JIMBO_APP__: JSON.stringify({ name: "tinnitus-a-go-go", ...jimboUiJson }),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 4444,
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
