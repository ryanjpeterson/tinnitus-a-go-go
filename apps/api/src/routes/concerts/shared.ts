/** Enum values the concert routes validate against. */

export const attendanceStatuses = [
  "interested",
  "attending",
  "attended",
  "missed",
  "cancelled",
] as const;

export const concertArtistRoles = [
  "headliner",
  "co_headliner",
  "support",
] as const;
