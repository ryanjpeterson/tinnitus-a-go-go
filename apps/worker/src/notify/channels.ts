/**
 * Where notifications go: email over SMTP (Gmail in production, Mailpit in dev)
 * and ntfy. Each channel is off until its env vars are set.
 */
import nodemailer from "nodemailer";
import { NOTIFY_CHANNELS_KEY, type NotifyChannels } from "@tagg/shared";
import { env } from "../env.js";
import { redis } from "../redis.js";

export const emailConfigured = Boolean(env.SMTP_HOST);
export const ntfyConfigured = Boolean(env.NTFY_TOPIC);

const mailer = emailConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 is TLS from the start; 587 (Gmail) upgrades with STARTTLS, required
      // whenever there's a password to send. Mailpit has neither.
      secure: env.SMTP_PORT === 465,
      requireTLS: Boolean(env.SMTP_USER),
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
    })
  : null;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (!mailer) throw new Error("Email isn't set up (SMTP_HOST).");
  await mailer.sendMail({ from: env.SMTP_FROM, ...msg });
}

export interface NtfyMessage {
  title: string;
  message: string;
  /** Opened when the notification is tapped. */
  click?: string;
  /** Emoji shortcodes, e.g. "ticket" → 🎫. */
  tags?: string[];
  /** 1 (min) … 5 (max); 3 is the default. */
  priority?: 1 | 2 | 3 | 4 | 5;
  actions?: { label: string; url: string }[];
}

export async function sendNtfy(msg: NtfyMessage): Promise<void> {
  if (!env.NTFY_TOPIC) throw new Error("ntfy isn't set up (NTFY_TOPIC).");
  const res = await fetch(env.NTFY_URL.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.NTFY_TOKEN ? { Authorization: `Bearer ${env.NTFY_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      topic: env.NTFY_TOPIC,
      title: msg.title,
      message: msg.message,
      click: msg.click,
      tags: msg.tags,
      priority: msg.priority,
      actions: msg.actions?.map((a) => ({ action: "view", label: a.label, url: a.url, clear: true })),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ntfy answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Tells the API (via Redis) which channels are set up, for the Account page. */
export async function publishChannels(): Promise<void> {
  const base = (env.NTFY_PUBLIC_URL ?? env.NTFY_URL).replace(/\/$/, "");
  const channels: NotifyChannels = {
    email: { configured: emailConfigured, host: env.SMTP_HOST ?? null },
    ntfy: { configured: ntfyConfigured, subscribeUrl: env.NTFY_TOPIC ? `${base}/${env.NTFY_TOPIC}` : null },
    timezone: env.TIMEZONE,
  };
  await redis.set(NOTIFY_CHANNELS_KEY, JSON.stringify(channels));
}
