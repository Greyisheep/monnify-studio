/**
 * Top chrome: brand, live/fixture source, unsafe/safe hero switch.
 * Provenance: #4, #44, D14.
 */
"use client";

import { HEROES, type HeroId } from "@/lib/constants";
import type { DataSource } from "@/lib/api";

export interface StudioHeaderProps {
  source: DataSource | null;
  version: number | null;
  dirty: boolean;
  heroId: HeroId;
  onHeroChange: (heroId: HeroId) => void;
}

export function StudioHeader({
  source,
  version,
  dirty,
  heroId,
  onHeroChange,
}: StudioHeaderProps) {
  return (
    <header className="studio-top">
      <div className="studio-brand">
        <span className="studio-mark">MS</span>
        <div>
          <h1>Monnify Studio</h1>
          <p>Architecture canvas - prove the system around the endpoint</p>
        </div>
      </div>
      <div className="studio-top__meta">
        <span className="studio-source" data-source={source ?? undefined}>
          {source === "api" ? "Live API" : source === "fixture" ? "Local fixtures" : "…"}
          {version != null ? ` · v${version}` : ""}
          {dirty ? " · unsaved" : ""}
        </span>
        <div className="studio-switch">
          {HEROES.map((hero) => (
            <button
              key={hero.id}
              type="button"
              className={heroId === hero.id ? "is-active" : ""}
              onClick={() => onHeroChange(hero.id)}
            >
              {hero.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
