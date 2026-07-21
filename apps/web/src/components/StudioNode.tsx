/**
 * Canvas node chrome. Selected nodes expand detail in-place (#44).
 * Provenance: #4, #44, D14.
 */
"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { categoryLabel } from "@/lib/studioCopy";
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
    <div
      className={`studio-node ${categoryClass}${selected ? " is-selected is-expanded" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="studio-handle" />
      <span className="studio-node__cat">{categoryLabel(data.category)}</span>
      <strong className="studio-node__label">{data.label}</strong>
      {selected && (
        <div className="studio-node__detail">
          <span>{data.title || data.label}</span>
          <span>Open panel for ports and config</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="studio-handle" />
    </div>
  );
}
