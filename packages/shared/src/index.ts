import { z } from "zod";

export * from "./util/slug.js";
export * from "./queues.js";

// CSV parser is NOT re-exported from this entry — it pulls in `csv-parse`, which Vite
// can't resolve through workspace-linked deps. Import from "@tagg/shared/csv" instead
// (only api and worker need it; web doesn't).

// Shared Zod schemas between API and web. Keeps validation rules in lockstep.

export const signupSchema = z.object({
  username: z
    .string()
    .min(3, "At least 3 characters.")
    .max(32, "At most 32 characters.")
    .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, underscore, and hyphen only."),
  email: z.string().email("Enter a valid email.").max(254),
  password: z
    .string()
    .min(12, "At least 12 characters.")
    .max(256, "At most 256 characters."),
  inviteCode: z.string().min(16).max(128),
  displayName: z.string().max(64).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your username or email.").max(254),
  password: z.string().min(1, "Enter your password.").max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userPublicSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  isAdmin: z.boolean(),
  emailVerifiedAt: z.string().nullable().optional(),
  invitesRemaining: z.number().int().nonnegative().optional(),
});
export type UserPublic = z.infer<typeof userPublicSchema>;

export const attendanceStatus = z.enum([
  "interested",
  "attending",
  "attended",
  "missed",
  "cancelled",
  "dismissed",
]);
export type AttendanceStatus = z.infer<typeof attendanceStatus>;
