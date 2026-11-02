/** Lineup roles: labels and sort order, shared by the lineup, setlist and page. */

export const ROLE_LABEL: Record<string, string> = {
  headliner:    "Headliner",
  co_headliner: "Co-headliner",
  support:      "Support",
  // Legacy values — kept for display of old data; new entries only use the three above
  opener:       "Support",
  festival_set: "Support",
};

export const ROLE_ORDER: Record<string, number> = {
  headliner: 0, co_headliner: 1, support: 2, opener: 2, festival_set: 2,
};
