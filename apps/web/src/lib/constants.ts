/**
 * Hero workflow ids. Provenance: #4, #44.
 */
export const HEROES = [
  { id: "marketplace-unsafe", label: "Unsafe hero" },
  { id: "marketplace-safe", label: "Safe hero" },
] as const;

export type HeroId = (typeof HEROES)[number]["id"];
