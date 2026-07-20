/**
 * Slim action bar + panel toggles. Palette is a vertical overlay (#44).
 * Provenance: #4, #27, #28, #44.
 */
"use client";

export interface StudioToolbarProps {
  canDelete: boolean;
  busy: boolean;
  canAct: boolean;
  hasFindings: boolean;
  paletteOpen: boolean;
  chatOpen: boolean;
  reviewOpen: boolean;
  traceOpen: boolean;
  running: boolean;
  onTogglePalette: () => void;
  onToggleChat: () => void;
  onToggleReview: () => void;
  onToggleTrace: () => void;
  onDelete: () => void;
  onReanalyze: () => void;
  onSave: () => void;
  onApplyAll: () => void;
  onRun: () => void;
}

export function StudioToolbar({
  canDelete,
  busy,
  canAct,
  hasFindings,
  paletteOpen,
  chatOpen,
  reviewOpen,
  traceOpen,
  running,
  onTogglePalette,
  onToggleChat,
  onToggleReview,
  onToggleTrace,
  onDelete,
  onReanalyze,
  onSave,
  onApplyAll,
  onRun,
}: StudioToolbarProps) {
  return (
    <div className="studio-toolbar">
      <div className="toolbar-panels">
        <button
          type="button"
          className={paletteOpen ? "is-active" : ""}
          onClick={onTogglePalette}
        >
          Nodes
        </button>
        <button
          type="button"
          className={chatOpen ? "is-active" : ""}
          onClick={onToggleChat}
        >
          Chat
        </button>
        <button
          type="button"
          className={reviewOpen ? "is-active" : ""}
          onClick={onToggleReview}
        >
          Review
        </button>
        <button
          type="button"
          className={traceOpen ? "is-active" : ""}
          onClick={onToggleTrace}
        >
          Trace
        </button>
      </div>
      <div className="toolbar-actions">
        <button type="button" disabled={!canDelete} onClick={onDelete}>
          Delete node
        </button>
        <button type="button" disabled={busy || !canAct} onClick={onReanalyze}>
          Re-analyze
        </button>
        <button type="button" disabled={busy || !canAct} onClick={onSave}>
          Save version
        </button>
        <button
          type="button"
          className="primary-btn"
          disabled={busy || !canAct || !hasFindings}
          onClick={onApplyAll}
        >
          Apply Fix (all)
        </button>
        <button
          type="button"
          className="primary-btn"
          disabled={busy || running || !canAct}
          onClick={onRun}
        >
          {running ? "Running…" : "Run (mock)"}
        </button>
      </div>
    </div>
  );
}
