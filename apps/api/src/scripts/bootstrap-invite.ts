/**
 * Bootstrap script: prints a one-time invite URL so the first admin can sign up.
 *
 * Usage:
 *   pnpm bootstrap-invite              # creates a 7-day admin invite
 *   pnpm bootstrap-invite --days 1     # custom expiry
 *   pnpm bootstrap-invite --note "Ryan, first admin"
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { env } from "../lib/env.js";
import { generateToken, hashToken } from "../auth/tokens.js";

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

async function main(): Promise<void> {
  const days = Number.parseInt(arg("days", "7") ?? "7", 10);
  const note = arg("note", "bootstrap admin invite");

  // Refuse to issue a bootstrap invite if there are already users — protects against
  // accidentally creating extra "first admin" codes in a populated instance.
  const existing = await db.query.users.findFirst();
  if (existing) {
    console.error(
      "Refusing to bootstrap: users already exist. Use the in-app invite system instead.",
    );
    process.exit(2);
  }

  const code = generateToken(32);
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await db.insert(schema.invites).values({
    codeHash,
    createdByUserId: null,
    note: note ?? null,
    expiresAt,
  });

  // Tag the next signup as admin: we can't mark the user admin yet (no user exists), so we
  // also flip a flag on the invite via the note. Simpler: rely on the bootstrap convention —
  // the very first user becomes admin automatically. We enforce that in the signup route by
  // checking row count when the bootstrap invite is redeemed; see TODO below.
  // For now, after first signup the user can be promoted via DB if needed:
  //   UPDATE users SET is_admin = true WHERE username = 'you';

  const url = `${env.APP_URL}/signup?invite=${code}`;
  console.log("");
  console.log("Bootstrap invite created.");
  console.log("Open this URL to sign up as the first user:");
  console.log("");
  console.log(`  ${url}`);
  console.log("");
  console.log(`Expires: ${expiresAt.toISOString()}`);
  console.log("");
  console.log("After signup, promote yourself to admin:");
  console.log(`  docker compose exec db psql -U ${process.env.POSTGRES_USER ?? "tagg"} -d ${process.env.POSTGRES_DB ?? "tagg"} -c "UPDATE users SET is_admin = true WHERE username = 'YOUR_USERNAME';"`);
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
