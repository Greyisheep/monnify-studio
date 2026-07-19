/**
 * React Flow surface for the Studio canvas. Provenance: #4, D14.
 */
"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { StudioNodeData } from "@/types";
import { StudioNode } from "./StudioNode";

const nodeTypes: NodeTypes = { studio: StudioNode };

export interface WorkflowCanvasProps {
  nodes: Node<StudioNodeData>[];
  edges: Edge[];
  loading: boolean;
  busy: boolean;
  typeError: string | null;
  diffNote: string | null;
  onNodesChange: OnNodesChange<Node<StudioNodeData>>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (connection: Connection) => void;
  onSelectionChange: OnSelectionChangeFunc;
  onGraphDirty: () => void;
}

export function WorkflowCanvas({
  nodes,
  edges,
  loading,
  busy,
  typeError,
  diffNote,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  onGraphDirty,
}: WorkflowCanvasProps) {
  return (
    <main className="studio-canvas">
      {(loading || busy) && (
        <div className="studio-banner">{loading ? "Loading IR…" : "Working…"}</div>
      )}
      {typeError && <div className="studio-banner studio-banner--error">{typeError}</div>}
      {diffNote && !typeError && (
        <div className="studio-banner studio-banner--ok">{diffNote}</div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(nodeChanges) => {
          onNodesChange(nodeChanges);
          onGraphDirty();
        }}
        onEdgesChange={(edgeChanges) => {
          onEdgesChange(edgeChanges);
          onGraphDirty();
        }}
        onConnect={(connection) => void onConnect(connection)}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </main>
  );
}
