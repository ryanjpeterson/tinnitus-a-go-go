import { hash, verify } from "@node-rs/argon2";

// argon2id params chosen per OWASP 2024 guidance.
const ARGON2_OPTS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain);
  } catch {
    return false;
  }
}

// Check against the Pwned Passwords k-anonymity API.
// Only the first 5 chars of the SHA-1 are sent; the password itself never leaves the server.
export async function isPasswordPwned(plain: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuf = await crypto.subtle.digest("SHA-1", data);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const prefix = hex.slice(0, 5);
  const suffix = hex.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false; // fail open: if HIBP is down, don't block signup
    const body = await res.text();
    return body
      .split("\n")
      .some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix);
  } catch {
    return false; // fail open on network error
  }
}

export const passwordRules = {
  minLength: 12,
  maxLength: 256,
} as const;

export function validatePasswordShape(plain: string): string | null {
  if (typeof plain !== "string") return "Password is required.";
  if (plain.length < passwordRules.minLength) {
    return `Password must be at least ${passwordRules.minLength} characters.`;
  }
  if (plain.length > passwordRules.maxLength) {
    return `Password must be at most ${passwordRules.maxLength} characters.`;
  }
  return null;
}
