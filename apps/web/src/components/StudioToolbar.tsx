/**
 * Palette + Save / Re-analyze / Apply Fix actions. Provenance: #4, #27.
 */
"use client";

import { NODE_PALETTE } from "@/lib/constants";
import type { NodeMeta } from "@/types";

export interface StudioToolbarProps {
  catalog: Record<string, NodeMeta>;
  nodeTypesMeta: Record<string, NodeMeta>;
  canDelete: boolean;
  busy: boolean;
  canAct: boolean;
  hasFindings: boolean;
  onAdd: (typeKey: string) => void;
  onDelete: () => void;
  onReanalyze: () => void;
  onSave: () => void;
  onApplyAll: () => void;
}

export function StudioToolbar({
  catalog,
  nodeTypesMeta,
  canDelete,
  busy,
  canAct,
  hasFindings,
  onAdd,
  onDelete,
  onReanalyze,
  onSave,
  onApplyAll,
}: StudioToolbarProps) {
  return (
    <div className="studio-toolbar">
      <div className="palette">
        <span className="palette__label">Add</span>
        {NODE_PALETTE.map((paletteItem) => (
          <button
            key={paletteItem.type}
            type="button"
            onClick={() => onAdd(paletteItem.type)}
          >
            +{" "}
            {(catalog[paletteItem.type] ?? nodeTypesMeta[paletteItem.type])?.title ??
              paletteItem.type}
          </button>
        ))}
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
