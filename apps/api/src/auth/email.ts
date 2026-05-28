/**
 * Email verification helpers.
 *
 *   createVerificationToken — generates a token, stores its hash, returns the RAW token.
 *                              Accepts an optional Drizzle transaction so it can run
 *                              inside the signup transaction atomically.
 *   sendVerificationEmail   — composes the email and sends via the SMTP transport.
 *                              Callers should not block their response on this; use
 *                              `void sendVerificationEmail(...).catch(log)` after the
 *                              signup transaction commits.
 */
import { db, schema } from "../db/client.js";
import { env } from "../lib/env.js";
import { sendMail } from "../lib/mailer.js";
import { generateToken, hashToken } from "./tokens.js";

const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Drizzle doesn't export a clean Transaction type; this synthesizes one from the db handle.
type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | TxClient;

export async function createVerificationToken(
  userId: string,
  email: string,
  tx: DbOrTx = db,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MS);
  await tx.insert(schema.emailVerificationTokens).values({
    tokenHash,
    userId,
    email,
    expiresAt,
  });
  return { rawToken, expiresAt };
}

export interface VerificationRecipient {
  email: string;
  displayName: string | null;
  username: string;
}

export async function sendVerificationEmail(
  user: VerificationRecipient,
  rawToken: string,
): Promise<void> {
  const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const greeting = user.displayName ?? user.username;

  const text = [
    `Hey ${greeting},`,
    "",
    "Confirm your email so we can keep this account legit:",
    "",
    url,
    "",
    "If you didn't sign up for Tinnitus A Go Go, ignore this email — your ears will thank you.",
    "",
    "— Tinnitus A Go Go",
  ].join("\n");

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; background:#0a0a0a; color:#f5f5f5; padding:32px;">
      <h1 style="font-family: 'Antonio', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; color:#E4FF3A; margin:0 0 16px;">Tinnitus <span style="font-family: 'Caveat Brush', cursive; color:#FF3D6E; text-transform: none;">a Go Go</span></h1>
      <p>Hey ${greeting},</p>
      <p>Confirm your email so we can keep this account legit:</p>
      <p>
        <a href="${url}" style="display:inline-block; background:#E4FF3A; color:#0a0a0a; padding:12px 20px; border-radius:6px; text-decoration:none; font-weight:600;">Confirm email</a>
      </p>
      <p style="color:#888; font-size:13px;">Or paste this URL into your browser:<br/><a href="${url}" style="color:#E4FF3A;">${url}</a></p>
      <p style="color:#888; font-size:13px;">If you didn't sign up, ignore this — your ears will thank you.</p>
    </div>
  `;

  await sendMail({
    to: user.email,
    subject: "Confirm your Tinnitus A Go Go email",
    text,
    html,
  });
}
