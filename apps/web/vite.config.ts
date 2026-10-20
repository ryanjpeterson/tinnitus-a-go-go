import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  // Build date as YYYY.MM.DD, shown on the account page — replaces a footer
  // version string that had to be bumped by hand and kept going stale.
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 10).replace(/-/g, ".")),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "logo.svg"],
      manifest: {
        name: "Tinnitus A Go Go",
        short_name: "Tinnitus",
        description: "A multi-user concert log for people who still believe the next show is worth the ringing.",
        theme_color: "#0B0B0C",
        background_color: "#0B0B0C",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        // Opening /api/... or media directly (e.g. the services panel's health
        // link) must hit the server, not get the SPA shell from the precache.
        navigateFallbackDenylist: [/^\/api\//, /^\/tagg-media\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Never cache auth responses — a stale /auth/me would keep showing
            // a signed-out user as signed in.
            urlPattern: /\/api\/(?!auth\/).*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
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
