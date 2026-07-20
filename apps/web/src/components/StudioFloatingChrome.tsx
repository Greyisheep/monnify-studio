/**
 * Floating chrome pills for Figma Maincollapsed (21:1732).
 */
"use client";

import Image from "next/image";

export interface StudioFloatingChromeProps {
  workflowName?: string;
  running: boolean;
  canAct: boolean;
  busy: boolean;
  onExpandPanels: () => void;
  onRun: () => void;
  onDeploy?: () => void;
  deployDisabled?: boolean;
}

export function StudioFloatingChrome({
  workflowName = "Workflow 1",
  running,
  canAct,
  busy,
  onExpandPanels,
  onRun,
  onDeploy,
  deployDisabled = true,
}: StudioFloatingChromeProps) {
  return (
    <>
      <div className="studio-float studio-float--left" role="group" aria-label="Workflow">
        <Image
          src="/figma/monnify-logo.svg"
          alt=""
          width={22}
          height={14}
          unoptimized
        />
        <div className="studio-float__meta">
          <strong>{workflowName}</strong>
        </div>
        <span className="studio-float__divider" aria-hidden />
        <button
          type="button"
          className="studio-float__panel"
          onClick={onExpandPanels}
          title="Show side panels"
          aria-label="Show side panels"
        >
          <Image
            src="/figma/icon-panel-left.svg"
            alt=""
            width={16}
            height={16}
            unoptimized
          />
        </button>
      </div>

      <div className="studio-float studio-float--right" role="group" aria-label="Actions">
        <button
          type="button"
          className="studio-float__icon"
          title="Theme (coming soon)"
          aria-label="Theme"
          disabled
        >
          <Image
            src="/figma/icon-moon.svg"
            alt=""
            width={16}
            height={16}
            unoptimized
          />
        </button>
        <span className="studio-float__divider" aria-hidden />
        <button
          type="button"
          className="studio-float__run"
          disabled={busy || running || !canAct}
          onClick={onRun}
        >
          <Image
            src="/figma/icon-play.svg"
            alt=""
            width={12}
            height={12}
            unoptimized
          />
          {running ? "Running…" : "Run"}
        </button>
        <button
          type="button"
          className="studio-float__deploy"
          disabled={deployDisabled || busy || !canAct}
          title={deployDisabled ? "Coming soon" : "Deploy"}
          onClick={onDeploy}
        >
          Deploy
        </button>
      </div>
    </>
  );
}
