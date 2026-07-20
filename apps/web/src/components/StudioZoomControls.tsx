/**
 * Horizontal zoom pill matching Figma Main / Maincollapsed (21:1670, 21:1732).
 * Icons: Lucide Minus / Plus.
 */
"use client";

import { Minus, Plus } from "lucide-react";
import { useReactFlow, useStore } from "@xyflow/react";

export function StudioZoomControls() {
  const { zoomIn, zoomOut } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  const pct = Math.round(zoom * 100);

  return (
    <div className="studio-zoom" role="group" aria-label="Zoom">
      <button
        type="button"
        className="studio-zoom__btn"
        onClick={() => void zoomOut({ duration: 160 })}
        aria-label="Zoom out"
      >
        <Minus aria-hidden size={14} strokeWidth={1.5} />
      </button>
      <span className="studio-zoom__divider" aria-hidden />
      <span className="studio-zoom__label" aria-live="polite">
        {pct}%
      </span>
      <span className="studio-zoom__divider" aria-hidden />
      <button
        type="button"
        className="studio-zoom__btn"
        onClick={() => void zoomIn({ duration: 160 })}
        aria-label="Zoom in"
      >
        <Plus aria-hidden size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
