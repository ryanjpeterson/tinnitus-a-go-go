/**
 * Fetch a user-supplied URL without letting it reach the server's own network.
 *
 * The API runs inside the compose network next to MinIO, Postgres, Redis and
 * itself, so a plain fetch(userUrl) can be pointed at http://minio:9000 or
 * http://api:3000. This resolves the hostname first and refuses loopback,
 * private, link-local and other non-public addresses — re-checking on every
 * redirect hop — and applies one timeout to the whole request including the
 * body read.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {}

const MAX_REDIRECTS = 5;

function isPrivateIPv4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT — includes Tailscale 100.x
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]!);
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only HTTP/HTTPS URLs are supported.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new UnsafeUrlError("Could not resolve that host.");
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("That address isn't on the public internet.");
  }
  return url;
}

/** Fetch a public URL and return the response with its body already read as text. */
export async function safeFetchText(
  rawUrl: string,
  init: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000);
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await assertPublicUrl(current);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: init.headers,
        redirect: "manual",
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, url).toString();
        continue;
      }
      return { status: res.status, ok: res.ok, text: await res.text() };
    }
    throw new UnsafeUrlError("Too many redirects.");
  } finally {
    clearTimeout(timer);
  }
}
