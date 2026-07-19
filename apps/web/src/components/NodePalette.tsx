/**
 * Vertical scrollable node catalog overlay (#44).
 * Canvas stays full-bleed; this floats and does not shrink the diagram.
 */
"use client";

import type { NodeMeta } from "@/types";

export interface NodePaletteProps {
  catalog: Record<string, NodeMeta>;
  open: boolean;
  onClose: () => void;
  onAdd: (typeKey: string) => void;
}

function groupByCategory(catalog: Record<string, NodeMeta>) {
  const groups = new Map<string, NodeMeta[]>();
  for (const meta of Object.values(catalog)) {
    const category = meta.category || "application";
    const list = groups.get(category) ?? [];
    list.push(meta);
    groups.set(category, list);
  }
  for (const list of groups.values()) {
    list.sort((left, right) => left.title.localeCompare(right.title));
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export function NodePalette({ catalog, open, onClose, onAdd }: NodePaletteProps) {
  if (!open) return null;

  const groups = groupByCategory(catalog);

  return (
    <aside className="studio-overlay studio-overlay--palette" aria-label="Node palette">
      <div className="studio-overlay__head">
        <div>
          <h2>Add node</h2>
          <p>Scroll the catalog. Click to drop on the canvas.</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="studio-overlay__body palette-list">
        {groups.length === 0 && <p className="muted">Catalog loading…</p>}
        {groups.map(([category, items]) => (
          <section key={category} className="palette-group">
            <h3>{category}</h3>
            <ul>
              {items.map((item) => (
                <li key={item.type}>
                  <button type="button" onClick={() => onAdd(item.type)}>
                    <strong>{item.title}</strong>
                    <span>{item.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
