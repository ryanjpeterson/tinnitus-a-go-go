/**
 * SMTP transport. In dev points at Mailpit (no auth, no TLS); in prod will point at the
 * configured provider via the same SMTP_* env vars. `sendMail` is fire-and-log: callers
 * should NOT block their response on it — wrap in `void` and catch errors locally so a
 * mail blip never breaks signup.
 */
import nodemailer from "nodemailer";
import { env } from "./env.js";

export const mailer = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  // Mailpit and most dev SMTP catchers don't speak TLS or require auth.
  secure: false,
  ignoreTLS: env.NODE_ENV === "development",
});

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  await mailer.sendMail({
    from: env.SMTP_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}
