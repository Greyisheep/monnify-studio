/**
 * Far-left icon rail from Figma Main (21:1670).
 * Icons: exact Figma exports in /public/figma/.
 */
"use client";

import Image from "next/image";

export interface StudioIconRailProps {
  active?: "workflow" | "dashboard" | "new";
  onNew?: () => void;
  onDashboard?: () => void;
  /** Draw the eye to the Dashboard (e.g. a run just produced new outflow). */
  nudgeDashboard?: boolean;
}

export function StudioIconRail({
  active = "workflow",
  onNew,
  onDashboard,
  nudgeDashboard = false,
}: StudioIconRailProps) {
  return (
    <nav className="studio-rail" aria-label="Studio navigation">
      <div className="studio-rail__logo">
        <Image
          src="/figma/monnify-logo-rail.svg"
          alt="Monnify"
          width={21}
          height={13}
          unoptimized
        />
      </div>
      <div className="studio-rail__sep" aria-hidden />
      <div className="studio-rail__items">
        <button
          type="button"
          className={`studio-rail__btn${active === "new" ? " is-active" : ""}`}
          title="New workflow"
          aria-label="New workflow"
          onClick={onNew}
        >
          <Image
            src="/figma/icon-rail-plus.svg"
            alt=""
            width={16}
            height={16}
            unoptimized
          />
        </button>
        <button
          type="button"
          className={`studio-rail__btn${active === "dashboard" ? " is-active" : ""}${
            nudgeDashboard && active !== "dashboard" ? " is-nudging" : ""
          }`}
          title={nudgeDashboard ? "New activity - open your Dashboard" : "Dashboard"}
          aria-label="Dashboard"
          onClick={onDashboard}
        >
          <Image
            src="/figma/icon-rail-grid.svg"
            alt=""
            width={16}
            height={16}
            unoptimized
          />
        </button>
        <button
          type="button"
          className={`studio-rail__btn${active === "workflow" ? " is-active" : ""}`}
          title="Workflow canvas"
          aria-label="Workflow canvas"
          aria-current={active === "workflow" ? "page" : undefined}
        >
          <Image
            src="/figma/icon-rail-workflow.svg"
            alt=""
            width={16}
            height={16}
            unoptimized
          />
        </button>
      </div>
    </nav>
  );
}
