/**
 * Horizontal zoom control matching Figma Main button group (21:1670).
 * Icons: exact Figma exports.
 */
"use client";

import Image from "next/image";
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
        <Image
          src="/figma/icon-zoom-minus.svg"
          alt=""
          width={16}
          height={16}
          unoptimized
        />
      </button>
      <span className="studio-zoom__label" aria-live="polite">
        {pct}%
      </span>
      <button
        type="button"
        className="studio-zoom__btn"
        onClick={() => void zoomIn({ duration: 160 })}
        aria-label="Zoom in"
      >
        <Image
          src="/figma/icon-zoom-plus.svg"
          alt=""
          width={16}
          height={16}
          unoptimized
        />
      </button>
    </div>
  );
}
