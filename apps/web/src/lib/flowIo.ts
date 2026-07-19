/**
 * IR <-> React Flow adapters.
 * Deep module: canvas code never invents edge/node IR shapes. Provenance: #4, D6.
 */
import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

import type {
  EdgeKind,
  IrEdge,
  IrNode,
  NodeCategory,
  NodeMeta,
  StudioNodeData,
  Workflow,
} from "@/types";

export function workflowToFlow(
  workflow: Workflow,
  nodeTypes: Record<string, NodeMeta>,
): { nodes: Node<StudioNodeData, "studio">[]; edges: Edge[] } {
  const nodes: Node<StudioNodeData, "studio">[] = workflow.nodes.map((irNode) => {
    const meta = nodeTypes[irNode.type];
    return {
      id: irNode.id,
      type: "studio",
      position: { x: irNode.position.x, y: irNode.position.y },
      data: {
        label: irNode.label ?? meta?.title ?? irNode.type,
        nodeType: irNode.type,
        category: (meta?.category ?? "application") as NodeCategory,
        title: meta?.title ?? irNode.type,
      },
    };
  });

  const edges: Edge[] = workflow.edges.map((irEdge, edgeIndex) =>
    edgeToFlow(irEdge, edgeIndex),
  );
  return { nodes, edges };
}

export function edgeToFlow(irEdge: IrEdge, edgeIndex: number): Edge {
  const isEvent = irEdge.kind === "event";
  return {
    id: `${irEdge.source}->${irEdge.target}-${edgeIndex}`,
    source: irEdge.source,
    target: irEdge.target,
    label: irEdge.condition ?? undefined,
    data: { kind: irEdge.kind },
    animated: isEvent,
    style: {
      stroke: isEvent ? "var(--edge-event)" : "var(--edge-control)",
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: isEvent ? "var(--edge-event)" : "var(--edge-control)",
    },
  };
}

export function flowToWorkflow(
  base: Workflow,
  nodes: Node<StudioNodeData>[],
  edges: Edge[],
): Workflow {
  const irNodes: IrNode[] = nodes.map((flowNode) => {
    const previousNode = base.nodes.find((baseNode) => baseNode.id === flowNode.id);
    return {
      id: flowNode.id,
      type: flowNode.data.nodeType,
      label: flowNode.data.label,
      config: previousNode?.config ?? {},
      inputs: previousNode?.inputs ?? {},
      extra_tags: previousNode?.extra_tags ?? [],
      position: { x: flowNode.position.x, y: flowNode.position.y },
    };
  });

  const irEdges: IrEdge[] = edges.map((flowEdge) => ({
    source: flowEdge.source,
    target: flowEdge.target,
    kind: ((flowEdge.data as { kind?: EdgeKind } | undefined)?.kind ??
      (flowEdge.animated ? "event" : "control")) as EdgeKind,
    condition: typeof flowEdge.label === "string" ? flowEdge.label : null,
  }));

  return {
    ...base,
    nodes: irNodes,
    edges: irEdges,
  };
}

export function newNodeId(existingIds: Set<string>, prefix: string): string {
  if (!existingIds.has(prefix)) return prefix;
  let suffix = 2;
  while (existingIds.has(`${prefix}${suffix}`)) suffix += 1;
  return `${prefix}${suffix}`;
}

export function canvasScreenCenter(): { x: number; y: number } {
  const canvasElement = document.querySelector(".studio-canvas");
  if (canvasElement instanceof HTMLElement) {
    const rect = canvasElement.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}
