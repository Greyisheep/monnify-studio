/**
 * Right inspect sidebar: moon / Run / Deploy + Preview | Code (Figma Main 21:1670).
 * Icons: Lucide Moon + Play.
 */
"use client";

import { Moon, Play } from "lucide-react";
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
          <Moon aria-hidden size={16} strokeWidth={1.5} />
        </button>
        <div className="studio-sidebar__action-row">
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--run"
            disabled={busy || running || !canAct}
            onClick={onRun}
          >
            <Play aria-hidden size={12} strokeWidth={1.5} fill="currentColor" />
            {running ? "Running…" : "Run"}
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
