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
        // Push notification handlers (public/push-sw.js).
        importScripts: ["push-sw.js"],
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
            // Offline: every API response is kept so pages you've seen (or saved
            // with "Save for offline") open without a connection. Network first,
            // so online you always get fresh data; a slow network falls back to
            // the saved copy after 4 s. Auth, admin and the offline bundle itself
            // (it fills this cache) are never kept —
            // a stale /auth/me would show a signed-out user as signed in.
            // Calendar feeds and push setup are never cached either.
            urlPattern: /\/api\/(?!auth\/|admin\/|offline\/|calendar\/|push\/).*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 3000,
                maxAgeSeconds: 60 * 60 * 24 * 60, // 60 days
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            // Flyers, artist and venue photos: served from the device instantly
            // (and offline), refreshed in the background — a replaced flyer keeps
            // the same URL, so plain cache-first would show the old one for months.
            // Videos are left out — too large to keep on a phone.
            urlPattern: /\/tagg-media\/.*\.(?:jpe?g|png|webp|gif)(?:\?.*)?$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "media-cache",
              expiration: {
                maxEntries: 3000,
                maxAgeSeconds: 60 * 60 * 24 * 180, // 180 days
                purgeOnQuotaError: true,
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
