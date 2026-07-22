"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

export type RosterRow = Record<string, string>;

export interface RosterColumn {
  key: string;
  label: string;
  placeholder?: string;
  /** Grid track for this column (e.g. "1.2fr", "0.8fr"). */
  width?: string;
  inputMode?: "text" | "tel" | "email" | "decimal" | "numeric";
}

interface RosterTableProps {
  columns: RosterColumn[];
  rows: RosterRow[];
  onChange: (rows: RosterRow[]) => void;
  addLabel?: string;
  emptyHint?: string;
}

/**
 * One roster table for people a flow acts on - employees to pay, ajo members to
 * collect from. Add/remove rows, a sticky header, Tab moves cell to cell (native),
 * Enter adds a row, and you can paste a CSV/spreadsheet block straight in.
 */
export function RosterTable({
  columns,
  rows,
  onChange,
  addLabel = "+ Add row",
  emptyHint = "No rows yet. Add your first below.",
}: RosterTableProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const blank = (): RosterRow =>
    Object.fromEntries(columns.map((c) => [c.key, ""]));
  const tracks = `${columns.map((c) => c.width ?? "1fr").join(" ")} 28px`;

  function setCell(index: number, key: string, value: string) {
    const next = rows.map((r) => ({ ...r }));
    if (!next[index]) return;
    next[index][key] = value;
    onChange(next);
  }
  function addRow() {
    onChange([...rows, blank()]);
    // Focus the first cell of the new row after it renders.
    requestAnimationFrame(() => {
      const inputs = gridRef.current?.querySelectorAll<HTMLInputElement>(
        ".roster__row input",
      );
      inputs?.[(rows.length) * columns.length]?.focus();
    });
  }
  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function onCellKeyDown(e: KeyboardEvent<HTMLInputElement>, isLastRow: boolean) {
    if (e.key === "Enter" && isLastRow) {
      e.preventDefault();
      addRow();
    }
  }

  // Paste a spreadsheet/CSV block: split into rows, map cells to columns in
  // order, append. Turns "copy a column of names+numbers" into a filled table.
  function onCellPaste(e: ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t,]/.test(text)) return; // single value: let the browser handle it
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length);
    const parsed = lines.map((line) => {
      const cells = line.split(/\t|,/).map((c) => c.trim());
      const row = blank();
      cells.forEach((cell, i) => {
        const col = columns[colIndex + i];
        if (col) row[col.key] = cell;
      });
      return row;
    });
    const next = rows.map((r) => ({ ...r }));
    // First pasted line fills the current row from the pasted column onward.
    parsed.forEach((prow, i) => {
      if (i === 0 && next[rowIndex]) {
        next[rowIndex] = { ...next[rowIndex], ...prow };
      } else {
        next.push(prow);
      }
    });
    onChange(next);
  }

  return (
    <div className="roster" ref={gridRef}>
      {rows.length > 0 ? (
        <div className="roster__grid" role="table">
          <div
            className="roster__row roster__row--head"
            role="row"
            style={{ gridTemplateColumns: tracks }}
          >
            {columns.map((c) => (
              <span key={c.key}>{c.label}</span>
            ))}
            <span aria-hidden />
          </div>
          {rows.map((row, rowIndex) => (
            <div
              className="roster__row"
              role="row"
              key={rowIndex}
              style={{ gridTemplateColumns: tracks }}
            >
              {columns.map((col, colIndex) => (
                <input
                  key={col.key}
                  aria-label={`${col.label} ${rowIndex + 1}`}
                  placeholder={col.placeholder}
                  inputMode={col.inputMode}
                  value={row[col.key] ?? ""}
                  onChange={(e) => setCell(rowIndex, col.key, e.target.value)}
                  onKeyDown={(e) => onCellKeyDown(e, rowIndex === rows.length - 1)}
                  onPaste={(e) => onCellPaste(e, rowIndex, colIndex)}
                />
              ))}
              <button
                type="button"
                className="roster__remove"
                aria-label={`Remove row ${rowIndex + 1}`}
                onClick={() => removeRow(rowIndex)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted roster__empty">{emptyHint}</p>
      )}
      <button type="button" className="ghost-btn" onClick={addRow}>
        {addLabel}
      </button>
    </div>
  );
}
