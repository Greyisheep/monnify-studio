/**
 * Far-left icon rail from Figma Main (21:1670).
 * Icons: Lucide (design system) — Plus, LayoutGrid, Workflow.
 */
"use client";

import Image from "next/image";
import { LayoutGrid, Plus, Workflow } from "lucide-react";

export interface StudioIconRailProps {
  active?: "workflow" | "dashboard" | "new";
  onNew?: () => void;
  onDashboard?: () => void;
}

export function StudioIconRail({
  active = "workflow",
  onNew,
  onDashboard,
}: StudioIconRailProps) {
  return (
    <nav className="studio-rail" aria-label="Studio navigation">
      <div className="studio-rail__logo">
        <Image
          src="/figma/monnify-logo.svg"
          alt="Monnify"
          width={22}
          height={14}
          unoptimized
        />
      </div>
      <div className="studio-rail__items">
        <button
          type="button"
          className={`studio-rail__btn${active === "new" ? " is-active" : ""}`}
          title="New workflow"
          aria-label="New workflow"
          onClick={onNew}
        >
          <Plus aria-hidden size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className={`studio-rail__btn${active === "dashboard" ? " is-active" : ""}`}
          title="Dashboard"
          aria-label="Dashboard"
          onClick={onDashboard}
        >
          <LayoutGrid aria-hidden size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className={`studio-rail__btn${active === "workflow" ? " is-active" : ""}`}
          title="Workflow canvas"
          aria-label="Workflow canvas"
          aria-current={active === "workflow" ? "page" : undefined}
        >
          <Workflow aria-hidden size={16} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
