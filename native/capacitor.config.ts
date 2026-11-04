/**
 * iOS shell config (jimbo-deploy templates/ios-shell). Everything app-specific
 * comes from the "ios" block of ../deploy.json, so this file stays the same
 * in every app.
 *
 * updates "live": the shell loads the web app from the server, so every
 *   deploy shows up the next time the app opens. www/ is only the page shown
 *   when the server can't be reached.
 * updates "bundled": the web build (../dist) is copied into the app, which
 *   works offline but needs a new build in Xcode for every update.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CapacitorConfig } from "@capacitor/cli";

const deploy = JSON.parse(readFileSync(join(__dirname, "..", "deploy.json"), "utf8"));
const ios = deploy.ios ?? {};
const live = (ios.updates ?? "live") === "live";

const config: CapacitorConfig = {
  appId: ios.appId ?? `com.ryanjpeterson.${deploy.app}`,
  appName: ios.name ?? deploy.app,
  webDir: live ? "www" : (ios.webDir ?? "../dist"),
  // Lets the web app tell it's in the shell (jimbo-ui's isInstalledApp).
  appendUserAgent: "JimboShell",
  server: live
    ? {
        url: ios.url ?? `http://macmini:${deploy.port}`,
        cleartext: (ios.url ?? "http:").startsWith("http:"),
        errorPath: "offline.html",
      }
    : undefined,
  ios: {
    // The page runs edge to edge; jimbo-ui's --safe-* insets do the rest.
    contentInset: "never",
    scrollEnabled: true,
  },
};

export default config;
