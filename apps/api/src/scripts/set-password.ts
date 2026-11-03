/**
 * Sets the account's password from the command line — the way back in if you
 * forget it (there's no email reset). With no account yet, use the app's setup
 * page instead.
 *
 * Usage:
 *   pnpm set-password                  # the admin account
 *   pnpm set-password --user ryan      # a specific username
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { hashPassword, validatePasswordShape } from "../auth/password.js";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main(): Promise<void> {
  const username = arg("user");
  const user = username
    ? await db.query.users.findFirst({ where: eq(schema.users.username, username) })
    : await db.query.users.findFirst({ where: eq(schema.users.isAdmin, true) });
  if (!user) {
    console.error(username ? `No account called "${username}".` : "No account yet — open the app to set it up.");
    process.exit(1);
  }

  const password = await askHidden(`New password for @${user.username}: `);

  const problem = validatePasswordShape(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, user.id));
  // Sign out everywhere: whoever had the old password shouldn't stay signed in.
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  console.log(`Password set for @${user.username}. Every session was signed out.`);
  process.exit(0);
}

/** Reads a line without echoing it (falls back to plain input when stdin isn't a terminal). */
function askHidden(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  return new Promise((resolve) => {
    let value = "";
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          if (stdin.isTTY) stdin.setRawMode(false);
          stdin.off("data", onData);
          stdin.pause();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130); // Ctrl-C
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

void main();
