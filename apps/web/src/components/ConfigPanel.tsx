"use client";

import { useState } from "react";

import type { Finding, IrNode, NodeMeta } from "@/lib/ir";

type Props = {
  node: IrNode | null;
  meta: NodeMeta | undefined;
  selectedFinding: Finding | null;
  onChange: (node: IrNode) => void;
  onClose: () => void;
};

export function ConfigPanel({ node, meta, selectedFinding, onChange, onClose }: Props) {
  const [mode, setMode] = useState<"business" | "json">("business");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  if (!node) {
    return (
      <aside className="studio-config">
        <div className="studio-config__head">
          <h2>Node config</h2>
          <p>Select a node on the canvas</p>
        </div>
        {selectedFinding && (
          <div className="studio-explain">
            <h3>Why this finding?</h3>
            <p>{selectedFinding.explanation}</p>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="studio-config">
      <div className="studio-config__head">
        <div>
          <h2>{node.label || meta?.title || node.type}</h2>
          <p>
            {meta?.category ?? "node"} · {node.type}
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="studio-switch studio-switch--compact">
        <button
          type="button"
          className={mode === "business" ? "is-active" : ""}
          onClick={() => setMode("business")}
        >
          Business
        </button>
        <button
          type="button"
          className={mode === "json" ? "is-active" : ""}
          onClick={() => {
            setJsonDraft(JSON.stringify(node, null, 2));
            setJsonError(null);
            setMode("json");
          }}
        >
          Advanced JSON
        </button>
      </div>

      {mode === "business" ? (
        <div className="studio-config__body">
          <label>
            Label
            <input
              value={node.label ?? ""}
              onChange={(e) => onChange({ ...node, label: e.target.value })}
            />
          </label>
          <label>
            Type
            <input value={node.type} readOnly />
          </label>
          {meta?.description && <p className="muted">{meta.description}</p>}
          {(meta?.inputs?.length ?? 0) > 0 && (
            <div className="port-list">
              <h4>Inputs</h4>
              {meta!.inputs!.map((p) => (
                <code key={p.name}>
                  {p.name}: {p.type}
                </code>
              ))}
            </div>
          )}
          {(meta?.outputs?.length ?? 0) > 0 && (
            <div className="port-list">
              <h4>Outputs</h4>
              {meta!.outputs!.map((p) => (
                <code key={p.name}>
                  {p.name}: {p.type}
                </code>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="studio-config__body">
          <textarea
            className="json-editor"
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            spellCheck={false}
          />
          {jsonError && <p className="type-error">{jsonError}</p>}
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              try {
                const parsed = JSON.parse(jsonDraft) as IrNode;
                if (!parsed.id || !parsed.type) {
                  throw new Error("Node JSON needs id and type");
                }
                onChange(parsed);
                setJsonError(null);
              } catch (err) {
                setJsonError(err instanceof Error ? err.message : "Invalid JSON");
              }
            }}
          >
            Apply JSON
          </button>
        </div>
      )}

      {selectedFinding && (
        <div className="studio-explain">
          <h3>[{selectedFinding.rule_id}] Explain</h3>
          <p>{selectedFinding.explanation}</p>
        </div>
      )}
    </aside>
  );
}
