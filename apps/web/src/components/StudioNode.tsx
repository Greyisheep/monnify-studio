/**
 * Canvas node chrome for React Flow. Provenance: #4, D14.
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

  return (
    <div className={`studio-node ${categoryClass}${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="studio-handle" />
      <span className="studio-node__cat">{data.category}</span>
      <strong className="studio-node__label">{data.label}</strong>
      <span className="studio-node__type">{data.nodeType}</span>
      <Handle type="source" position={Position.Right} className="studio-handle" />
    </div>
  );
}
