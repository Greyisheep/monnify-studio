/**
 * Node config overlay (business fields + advanced JSON). Provenance: #4, #44.
 */
"use client";

import { useEffect, useState, type ChangeEvent } from "react";

import { categoryLabel } from "@/lib/studioCopy";
import type { Finding, IrNode, NodeMeta } from "@/types";

export interface ConfigPanelProps {
  node: IrNode | null;
  meta: NodeMeta | undefined;
  selectedFinding: Finding | null;
  onChange: (node: IrNode) => void;
  onClose: () => void;
}

function normalizeIrNode(parsed: Partial<IrNode>, fallback: IrNode): IrNode {
  if (!parsed.type || typeof parsed.type !== "string") {
    throw new Error("Node JSON needs a string type");
  }
  const id =
    typeof parsed.id === "string" && parsed.id.trim()
      ? parsed.id.trim()
      : fallback.id;
  return {
    id,
    type: parsed.type,
    label: parsed.label ?? fallback.label ?? null,
    config:
      parsed.config && typeof parsed.config === "object" ? parsed.config : {},
    inputs:
      parsed.inputs && typeof parsed.inputs === "object" ? parsed.inputs : {},
    extra_tags: Array.isArray(parsed.extra_tags) ? parsed.extra_tags : [],
    position: {
      x: Number(parsed.position?.x ?? fallback.position.x),
      y: Number(parsed.position?.y ?? fallback.position.y),
    },
  };
}

export function ConfigPanel({
  node,
  meta,
  selectedFinding,
  onChange,
  onClose,
}: ConfigPanelProps) {
  const [mode, setMode] = useState<"business" | "json">("business");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSaved, setJsonSaved] = useState(false);

  useEffect(() => {
    setMode("business");
    setJsonError(null);
    setJsonSaved(false);
  }, [node?.id]);

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
          <p>{categoryLabel(meta?.category ?? "application")}</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="studio-switch studio-switch--compact" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "business"}
          className={mode === "business" ? "is-active" : ""}
          onClick={() => {
            setMode("business");
            setJsonSaved(false);
          }}
        >
          Business
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "json"}
          className={mode === "json" ? "is-active" : ""}
          onClick={() => {
            setJsonDraft(JSON.stringify(node, null, 2));
            setJsonError(null);
            setJsonSaved(false);
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
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onChange({ ...node, label: event.target.value })
              }
            />
          </label>
          {meta?.description && <p className="muted">{meta.description}</p>}
          {(meta?.inputs?.length ?? 0) > 0 && (
            <div className="port-list">
              <h4>Inputs</h4>
              {meta!.inputs!.map((port) => (
                <code key={port.name}>
                  {port.name}: {port.type}
                </code>
              ))}
            </div>
          )}
          {(meta?.outputs?.length ?? 0) > 0 && (
            <div className="port-list">
              <h4>Outputs</h4>
              {meta!.outputs!.map((port) => (
                <code key={port.name}>
                  {port.name}: {port.type}
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
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              setJsonDraft(event.target.value);
              setJsonSaved(false);
            }}
            spellCheck={false}
          />
          {jsonError && <p className="type-error">{jsonError}</p>}
          {jsonSaved && !jsonError && (
            <p className="muted">JSON applied to this node.</p>
          )}
          <button
            type="button"
            className="primary-btn studio-config__apply"
            onClick={() => {
              try {
                const parsed = JSON.parse(jsonDraft) as Partial<IrNode>;
                const normalized = normalizeIrNode(parsed, node);
                onChange(normalized);
                setJsonDraft(JSON.stringify(normalized, null, 2));
                setJsonError(null);
                setJsonSaved(true);
              } catch (error) {
                setJsonSaved(false);
                setJsonError(
                  error instanceof Error ? error.message : "Invalid JSON",
                );
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
