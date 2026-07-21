/**
 * Canvas node chrome. Selected nodes expand detail in-place (#44).
 * Run I/O pills (#151). Why? explain affordance (#76).
 * Provenance: #4, #44, #76, #151, D14.
 */
"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { StudioNodeData } from "@/types";

export type StudioFlowNode = Node<StudioNodeData, "studio">;

const CATEGORY_CLASS: Record<string, string> = {
  monnify: "cat-monnify",
  event: "cat-event",
  control: "cat-control",
  safety: "cat-safety",
  application: "cat-application",
};

export function StudioNode({ data, selected }: NodeProps<StudioFlowNode>) {
  const categoryClass = CATEGORY_CLASS[data.category] ?? "cat-application";
  const runIo = data.runIo;

  return (
    <div
      className={`studio-node ${categoryClass}${selected ? " is-selected is-expanded" : ""}${
        runIo?.failed ? " is-run-failed" : runIo ? " is-run-done" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="studio-handle" />
      <span className="studio-node__cat">{data.category}</span>
      <strong className="studio-node__label">{data.label}</strong>
      {runIo ? (
        <p
          className={`studio-node__io${runIo.failed ? " is-failed" : ""}`}
          title={`${runIo.inputsSummary} → ${runIo.outputsSummary}`}
        >
          <span className="studio-node__io-in">{runIo.inputsSummary}</span>
          <span className="studio-node__io-arrow" aria-hidden>
            →
          </span>
          <span className="studio-node__io-out">{runIo.outputsSummary}</span>
        </p>
      ) : null}
      {selected && (
        <div className="studio-node__detail">
          <span>{data.title || data.label}</span>
          <span className="studio-node__type">{data.nodeType}</span>
          <span>Open the Code / Preview panel for config</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="studio-handle" />
    </div>
  );
}
