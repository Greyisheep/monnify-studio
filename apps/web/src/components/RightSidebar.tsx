/**
 * Right inspect sidebar: moon / Run / Deploy + Preview | Code
 * Figma Chat and Code panel (118:3740) / Main (21:1670).
 */
"use client";

import Image from "next/image";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

export interface RightSidebarProps {
  rightTab: "preview" | "code";
  onRightTabChange: (tab: "preview" | "code") => void;
  running: boolean;
  canAct: boolean;
  busy: boolean;
  onRun: () => void;
  onDeploy: () => void;
  deployDisabled?: boolean;
  deployTitle?: string;
  onResizeStart?: (event: ReactPointerEvent) => void;
  children: ReactNode;
}

export function RightSidebar({
  rightTab,
  onRightTabChange,
  running,
  canAct,
  busy,
  onRun,
  onDeploy,
  deployDisabled = false,
  deployTitle,
  onResizeStart,
  children,
}: RightSidebarProps) {
  return (
    <aside className="studio-sidebar studio-sidebar--right" aria-label="Inspect">
      <div
        className="studio-sidebar__resize studio-sidebar__resize--west"
        onPointerDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right sidebar"
      />
      <div className="studio-sidebar__actions">
        <button
          type="button"
          className="studio-sidebar__moon"
          title="Theme (coming soon)"
          aria-label="Theme"
          disabled
        >
          <Image
            src="/figma/icon-moon-figma.svg"
            alt=""
            width={16}
            height={16}
            unoptimized
          />
        </button>
        <div className="studio-sidebar__action-row">
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--run"
            data-tour="dev-run"
            disabled={busy || running || !canAct}
            onClick={onRun}
          >
            <Image
              src="/figma/icon-play-figma.svg"
              alt=""
              width={12}
              height={12}
              unoptimized
            />
            {running ? "Running…" : "Practice run"}
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--deploy"
            disabled={deployDisabled || busy || !canAct}
            title={deployTitle}
            onClick={onDeploy}
          >
            Deploy
          </button>
        </div>
      </div>

      <div
        className="studio-tabs studio-tabs--inspect"
        role="tablist"
        aria-label="Right panel"
      >
        <button
          type="button"
          role="tab"
          aria-selected={rightTab === "preview"}
          className={rightTab === "preview" ? "is-active" : ""}
          onClick={() => onRightTabChange("preview")}
        >
          Preview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rightTab === "code"}
          className={rightTab === "code" ? "is-active" : ""}
          onClick={() => onRightTabChange("code")}
        >
          Code
        </button>
      </div>

      <div className="studio-sidebar__scroll studio-sidebar__scroll--right">
        {children}
      </div>
    </aside>
  );
}
