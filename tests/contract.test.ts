/**
 * Web ↔ API contract, checked from source: every URL the web client calls
 * (apps/web/src/lib/api.ts) is served by a route the API registers, and the
 * routes removed as unused stay gone. Catches a route deleted or renamed on one
 * side only.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

function walk(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : [],
  );
}

/** "/concerts/:idOrSlug" → /^\/concerts\/[^/]+$/ (also "export.:format"-style segments). */
function routeRegex(route: string): RegExp {
  const body = route.split("/").map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:\w+/g, "[^/]+")).join("/");
  return new RegExp(`^${body}$`);
}

const apiRoutes = walk("apps/api/src/routes").flatMap((f) =>
  [...read(f).matchAll(/app\.(?:get|post|put|patch|delete)\(\s*(["`])([^"`]+)\1/g)].map((m) => m[2]!.replace(/\$\{\w+\}/g, ":param")),
);

const clientPaths = (() => {
  const src = read("apps/web/src/lib/api.ts");
  const literals = [...src.matchAll(/(["`])(\/(?:api\/)?[a-z][^"`\s]*)\1/g)].map((m) => m[2]!);
  return [...new Set(
    literals
      .filter((p) => !p.startsWith("/tagg-media") && p !== "/api${path}")
      .map((p) => p
        .replace(/^\/api(?=\/)/, "")
        .replace(/\$\{(?:query|qs[^}]*)\}/g, "")
        .replace(/\?.*$/, "")
        .replace(/\$\{[^}]+\}/g, "x")),
  )];
})();

describe("web client ↔ API routes", () => {
  it("finds both sides", () => {
    expect(apiRoutes.length).toBeGreaterThan(60);
    expect(clientPaths.length).toBeGreaterThan(50);
  });

  it.each(clientPaths)("%s is served by the API", (p) => {
    expect(apiRoutes.some((r) => routeRegex(r).test(p)), `no API route matches ${p}`).toBe(true);
  });

  it("removed routes stay removed", () => {
    for (const gone of ["/public/concerts", "/public/copy", "/admin/copy", "/concerts/batch", "/concerts/stats", "/offline/bundle", "/push/key", "/push/prefs", "/auth/signup", "/auth/verify-email", "/invites", "/invites/check"]) {
      expect(apiRoutes, gone).not.toContain(gone);
    }
  });
});
