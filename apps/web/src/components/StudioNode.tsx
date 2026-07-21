/**
 * Canvas node chrome. Selected nodes expand detail in-place (#44).
 * Provenance: #4, #44, D14.
 */
"use client";

import { useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { ExecutionEvent, StudioNodeData } from "@/types";

export type StudioFlowNode = Node<StudioNodeData, "studio">;

const CATEGORY_CLASS: Record<string, string> = {
  monnify: "cat-monnify",
  event: "cat-event",
  control: "cat-control",
  safety: "cat-safety",
  application: "cat-application",
};

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function valuePreview(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toLocaleString("en-NG");
  if (typeof value === "boolean") return String(value);
  if (value == null) return "—";
  return pretty(value);
}

function payloadPreview(payload: Record<string, unknown> | null | undefined): string {
  const entry = Object.entries(payload ?? {})[0];
  if (!entry) return "—";
  const value = valuePreview(entry[1]);
  const preview = `${entry[0]}: ${value}`;
  return preview.length > 34 ? `${preview.slice(0, 31)}…` : preview;
}

function RunDetail({
  event,
  state,
}: {
  event: ExecutionEvent;
  state: string;
}) {
  const fields: Array<[string, unknown]> = [
    ["Inputs", event.inputs],
    ["Request (redacted)", event.request],
    ["Response (redacted)", event.response],
    ["Outputs", event.outputs],
    ["Duration", event.duration_ms == null ? "Not reported" : `${event.duration_ms}ms`],
  ];

  return (
    <div className="studio-node__run-detail">
      <strong>{state}</strong>
      {fields.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <pre>
            {typeof value === "string"
              ? value
              : value == null
                ? "Not recorded"
                : pretty(value)}
          </pre>
        </div>
      ))}
      {event.error && (
        <div>
          <span>Error</span>
          <pre className="studio-node__run-error">{event.error}</pre>
        </div>
      )}
    </div>
  );
}

export function StudioNode({ data, selected }: NodeProps<StudioFlowNode>) {
  const categoryClass = CATEGORY_CLASS[data.category] ?? "cat-application";
  const [detailOpen, setDetailOpen] = useState(false);
  const runResult = data.execution;

  return (
    <div
      className={`studio-node ${categoryClass}${selected ? " is-selected is-expanded" : ""}${
        runResult ? ` is-${runResult.state}` : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="studio-handle" />
      <span className="studio-node__cat">{data.category}</span>
      <strong className="studio-node__label">{data.label}</strong>
      {runResult && (
        <div className="studio-node__run">
          <span className="studio-node__run-state">{runResult.state}</span>
          <button
            type="button"
            className="studio-node__io-pill"
            aria-expanded={detailOpen}
            onClick={(event) => {
              event.stopPropagation();
              setDetailOpen((open) => !open);
            }}
          >
            <span>{payloadPreview(runResult.event.inputs)}</span>
            <span aria-hidden="true">→</span>
            <span>{payloadPreview(runResult.event.outputs)}</span>
          </button>
          {detailOpen && (
            <RunDetail event={runResult.event} state={runResult.state} />
          )}
        </div>
      )}
      {selected && (
        <div className="studio-node__detail">
          <span>{data.title || data.label}</span>
          <span className="studio-node__type">{data.nodeType}</span>
          <span>Open panel for ports and config</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="studio-handle" />
    </div>
  );
}
