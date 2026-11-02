import { createHash, randomBytes } from "node:crypto";

// Cryptographically random URL-safe token. 32 bytes = 256 bits of entropy.
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// We never store raw tokens. Store sha256(token) in the DB, compare hashes.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
