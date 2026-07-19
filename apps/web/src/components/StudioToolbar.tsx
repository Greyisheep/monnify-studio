/**
 * Slim action bar + panel toggles. Palette is a vertical overlay (#44).
 * Provenance: #4, #27, #44.
 */
"use client";

export interface StudioToolbarProps {
  canDelete: boolean;
  busy: boolean;
  canAct: boolean;
  hasFindings: boolean;
  paletteOpen: boolean;
  reviewOpen: boolean;
  onTogglePalette: () => void;
  onToggleReview: () => void;
  onDelete: () => void;
  onReanalyze: () => void;
  onSave: () => void;
  onApplyAll: () => void;
}

export function StudioToolbar({
  canDelete,
  busy,
  canAct,
  hasFindings,
  paletteOpen,
  reviewOpen,
  onTogglePalette,
  onToggleReview,
  onDelete,
  onReanalyze,
  onSave,
  onApplyAll,
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
          className={reviewOpen ? "is-active" : ""}
          onClick={onToggleReview}
        >
          Review
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
      </div>
    </div>
  );
}
