"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

const MIN = 220;
const MAX = 520;
const DEFAULT_LEFT = 280;
const DEFAULT_RIGHT = 320;

function clamp(value: number) {
  return Math.min(MAX, Math.max(MIN, value));
}

/** Drag-to-resize left/right studio sidebars via CSS variables on the shell. */
export function useSidebarWidths() {
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT);
  const dragRef = useRef<{
    side: "left" | "right";
    startX: number;
    startWidth: number;
  } | null>(null);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.side === "left") {
      setLeftWidth(clamp(drag.startWidth + (event.clientX - drag.startX)));
    } else {
      setRightWidth(clamp(drag.startWidth + (drag.startX - event.clientX)));
    }
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    document.body.classList.remove("is-resizing-sidebar");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  const beginResize = useCallback(
    (side: "left" | "right", event: ReactPointerEvent) => {
      event.preventDefault();
      dragRef.current = {
        side,
        startX: event.clientX,
        startWidth: side === "left" ? leftWidth : rightWidth,
      };
      document.body.classList.add("is-resizing-sidebar");
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [leftWidth, onPointerMove, onPointerUp, rightWidth],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("is-resizing-sidebar");
    };
  }, [onPointerMove, onPointerUp]);

  return {
    leftWidth,
    rightWidth,
    beginResize,
    shellStyle: {
      ["--sidebar-left-width"]: `${leftWidth}px`,
      ["--sidebar-right-width"]: `${rightWidth}px`,
    } as CSSProperties,
  };
}
