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
import { placeFreeOfNodes } from "@/lib/placeNode";
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
    (typeKey: string, dropFlow?: { x: number; y: number }) => {
      if (!typeKey.trim()) return;
      const meta = catalog[typeKey] ?? nodeTypesMeta[typeKey];
      const prefix = typeKey.split(".").pop() ?? "node";
      const label = meta?.title ?? typeKey;
      const nodeId = newNodeId(new Set(nodes.map((node) => node.id)), prefix);
      const center = screenToFlowPosition(canvasScreenCenter());
      const origin = dropFlow ?? {
        x: center.x - 90,
        y: center.y - 30,
      };
      const position = placeFreeOfNodes(
        nodes.map((node) => node.position),
        { w: 180, h: 72 },
        origin,
      );

      const node: StudioFlowNode = {
        id: nodeId,
        type: "studio",
        position,
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
      setDiffNote(
        dropFlow
          ? `Dropped "${label}" on the whiteboard`
          : `Added "${label}" - drag handles to connect it`,
      );
      requestAnimationFrame(() => {
        setCenter(position.x + 90, position.y + 30, { zoom: 1.05, duration: 220 });
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
      // Always key off the selected canvas node so Apply JSON cannot silently
      // no-op when the draft id drifts from the selection (#44).
      if (!selectedNodeId) return;
      const fromId = selectedNodeId;
      const toId = (nextNode.id || fromId).trim() || fromId;
      const normalized: IrNode = {
        id: toId,
        type: nextNode.type,
        label: nextNode.label ?? null,
        config: nextNode.config ?? {},
        inputs: nextNode.inputs ?? {},
        extra_tags: nextNode.extra_tags ?? [],
        position: nextNode.position ?? { x: 0, y: 0 },
      };

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === fromId
            ? {
                ...node,
                id: toId,
                position: {
                  x: normalized.position.x,
                  y: normalized.position.y,
                },
                selected: true,
                data: {
                  ...node.data,
                  label: normalized.label ?? node.data.label,
                  nodeType: normalized.type,
                  title: catalog[normalized.type]?.title ?? normalized.type,
                  category: (catalog[normalized.type]?.category ??
                    node.data.category) as NodeCategory,
                },
              }
            : { ...node, selected: false },
        ),
      );

      if (toId !== fromId) {
        setEdges((currentEdges) =>
          currentEdges.map((edge) => ({
            ...edge,
            source: edge.source === fromId ? toId : edge.source,
            target: edge.target === fromId ? toId : edge.target,
          })),
        );
        setSelectedNodeId(toId);
      }

      setWorkflow((currentWorkflow) => {
        if (!currentWorkflow) return currentWorkflow;
        return {
          ...currentWorkflow,
          entrypoint:
            currentWorkflow.entrypoint === fromId
              ? toId
              : currentWorkflow.entrypoint,
          nodes: currentWorkflow.nodes.map((irNode) =>
            irNode.id === fromId ? normalized : irNode,
          ),
        };
      });
      setDirty(true);
    },
    [
      catalog,
      selectedNodeId,
      setDirty,
      setEdges,
      setNodes,
      setSelectedNodeId,
      setWorkflow,
    ],
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
