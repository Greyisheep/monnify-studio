/**
 * React Flow surface: full-bleed canvas under overlay panels (#44).
 * Fit-view after dagre layout when structure changes (#37). Provenance: #4, #37, #44, D14.
 */
"use client";

import { useEffect } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ConnectionFeedback } from "@/hooks/useStudioGraph";
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
  connectionFeedback: ConnectionFeedback;
  layoutNonce: number;
  onNodesChange: OnNodesChange<Node<StudioNodeData>>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (connection: Connection) => void;
  onSelectionChange: OnSelectionChangeFunc;
  onGraphDirty: () => void;
}

function FitViewOnLayout({ layoutNonce }: { layoutNonce: number }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (layoutNonce === 0) return;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 220 });
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutNonce, fitView]);

  return null;
}

export function WorkflowCanvas({
  nodes,
  edges,
  loading,
  busy,
  typeError,
  diffNote,
  connectionFeedback,
  layoutNonce,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  onGraphDirty,
}: WorkflowCanvasProps) {
  const connectionStroke =
    connectionFeedback === "valid"
      ? "var(--accent)"
      : connectionFeedback === "invalid"
        ? "var(--danger)"
        : "var(--edge-control)";

  return (
    <main
      className={`studio-canvas${
        connectionFeedback ? ` is-connection-${connectionFeedback}` : ""
      }`}
    >
      {(loading || busy) && (
        <div className="studio-banner">{loading ? "Loading IR…" : "Working…"}</div>
      )}
      {typeError && (
        <div className="studio-banner studio-banner--error">{typeError}</div>
      )}
      {connectionFeedback === "valid" && !typeError && (
        <div className="studio-banner studio-banner--ok">Connection valid</div>
      )}
      {diffNote && !typeError && connectionFeedback !== "valid" && (
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
        connectionLineStyle={{ stroke: connectionStroke, strokeWidth: 2 }}
      >
        <FitViewOnLayout layoutNonce={layoutNonce} />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </main>
  );
}
