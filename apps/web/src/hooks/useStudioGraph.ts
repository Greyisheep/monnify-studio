/**
 * Canvas graph mutations: connect (typed), add, delete, update selection.
 * Connection aliveness: green valid / red invalid (#44). Provenance: #4, #44.
 */
"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";

import { validateConnection } from "@/lib/api";
import { canvasScreenCenter, edgeToFlow, newNodeId } from "@/lib/flowIo";
import type {
  IrNode,
  NodeCategory,
  NodeMeta,
  StudioNodeData,
  Workflow,
} from "@/types";

export type StudioFlowNode = Node<StudioNodeData, "studio">;
export type ConnectionFeedback = "valid" | "invalid" | null;

export interface UseStudioGraphOptions {
  nodes: Node<StudioNodeData>[];
  setNodes: Dispatch<SetStateAction<Node<StudioNodeData>[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  catalog: Record<string, NodeMeta>;
  nodeTypesMeta: Record<string, NodeMeta>;
  selectedNodeId: string | null;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setTypeError: Dispatch<SetStateAction<string | null>>;
  setDiffNote: Dispatch<SetStateAction<string | null>>;
  setWorkflow: Dispatch<SetStateAction<Workflow | null>>;
}

export function useStudioGraph({
  nodes,
  setNodes,
  setEdges,
  catalog,
  nodeTypesMeta,
  selectedNodeId,
  setSelectedNodeId,
  setDirty,
  setTypeError,
  setDiffNote,
  setWorkflow,
}: UseStudioGraphOptions) {
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const [connectionFeedback, setConnectionFeedback] =
    useState<ConnectionFeedback>(null);

  const flashConnection = useCallback((feedback: ConnectionFeedback) => {
    setConnectionFeedback(feedback);
    window.setTimeout(() => setConnectionFeedback(null), 1600);
  }, []);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (!sourceNode || !targetNode) return;

      const check = await validateConnection({
        source_type: sourceNode.data.nodeType,
        target_type: targetNode.data.nodeType,
      });
      if (!check.ok) {
        setTypeError(check.message || "TYPE ERROR");
        flashConnection("invalid");
        return;
      }
      setTypeError(null);
      flashConnection("valid");
      const sourceMeta =
        catalog[sourceNode.data.nodeType] ?? nodeTypesMeta[sourceNode.data.nodeType];
      const kind = sourceMeta?.category === "event" ? "event" : "control";
      setEdges((currentEdges) =>
        addEdge(
          edgeToFlow(
            {
              source: connection.source!,
              target: connection.target!,
              kind,
              condition: null,
            },
            currentEdges.length,
          ),
          currentEdges,
        ),
      );
      setDirty(true);
    },
    [
      catalog,
      flashConnection,
      nodeTypesMeta,
      nodes,
      setDirty,
      setEdges,
      setTypeError,
    ],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      setSelectedNodeId(selectedNodes[0]?.id ?? null);
    },
    [setSelectedNodeId],
  );

  const addNode = useCallback(
    (typeKey: string) => {
      const meta = catalog[typeKey] ?? nodeTypesMeta[typeKey];
      const prefix = typeKey.split(".").pop() ?? "node";
      const label = meta?.title ?? typeKey;
      const nodeId = newNodeId(new Set(nodes.map((node) => node.id)), prefix);
      const position = screenToFlowPosition(canvasScreenCenter());

      const node: StudioFlowNode = {
        id: nodeId,
        type: "studio",
        position: { x: position.x - 90, y: position.y - 30 },
        selected: true,
        data: {
          label,
          nodeType: typeKey,
          category: (meta?.category ?? "application") as NodeCategory,
          title: label,
        },
      };

      setNodes((currentNodes) => [
        ...currentNodes.map((currentNode) => ({ ...currentNode, selected: false })),
        node,
      ]);
      setSelectedNodeId(nodeId);
      setDirty(true);
      setTypeError(null);
      setDiffNote(`Added "${label}" - drag handles to connect it`);
      requestAnimationFrame(() => {
        setCenter(position.x, position.y, { zoom: 1.05, duration: 220 });
      });
    },
    [
      catalog,
      nodeTypesMeta,
      nodes,
      screenToFlowPosition,
      setCenter,
      setDiffNote,
      setDirty,
      setNodes,
      setSelectedNodeId,
      setTypeError,
    ],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((currentNodes) =>
      currentNodes.filter((node) => node.id !== selectedNodeId),
    );
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      ),
    );
    setSelectedNodeId(null);
    setDirty(true);
  }, [selectedNodeId, setDirty, setEdges, setNodes, setSelectedNodeId]);

  const updateSelectedNode = useCallback(
    (nextNode: IrNode) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nextNode.id
            ? {
                ...node,
                id: nextNode.id,
                position: { x: nextNode.position.x, y: nextNode.position.y },
                data: {
                  ...node.data,
                  label: nextNode.label ?? node.data.label,
                  nodeType: nextNode.type,
                  title: catalog[nextNode.type]?.title ?? nextNode.type,
                  category: (catalog[nextNode.type]?.category ??
                    node.data.category) as NodeCategory,
                },
              }
            : node,
        ),
      );
      setWorkflow((currentWorkflow) => {
        if (!currentWorkflow) return currentWorkflow;
        return {
          ...currentWorkflow,
          nodes: currentWorkflow.nodes.map((irNode) =>
            irNode.id === nextNode.id ? nextNode : irNode,
          ),
        };
      });
      setDirty(true);
    },
    [catalog, setDirty, setNodes, setWorkflow],
  );

  return {
    onConnect,
    onSelectionChange,
    addNode,
    deleteSelected,
    updateSelectedNode,
    connectionFeedback,
  };
}
