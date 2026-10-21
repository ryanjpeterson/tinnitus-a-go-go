/**
 * Lineup billing rules, matching what the database enforces (migration 0015):
 * at most one headliner, and never a headliner alongside co-headliners.
 */

export type Role = "headliner" | "co_headliner" | "support";

/**
 * Roles for a lineup in listed order. Explicit roles are kept; when nothing
 * is billed at the top, the last-listed act headlines (the convention the
 * add-show form and CSV import use). Returns an error message for lineups
 * that break the rules.
 */
export function billingRoles(roles: (Role | undefined)[]): { roles: Role[] } | { error: string } {
  const headliners = roles.filter((r) => r === "headliner").length;
  const coHeadliners = roles.filter((r) => r === "co_headliner").length;
  if (headliners > 1) return { error: "A lineup can have only one headliner — use co-headliners for equal billing." };
  if (headliners > 0 && coHeadliners > 0) return { error: "A lineup cannot mix a headliner and co-headliners." };
  const out = roles.map((r) => r ?? "support");
  if (headliners === 0 && coHeadliners === 0 && out.length > 0 && roles.every((r) => r === undefined)) {
    out[out.length - 1] = "headliner";
  }
  return { roles: out };
}
