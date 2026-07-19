import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

import type { EdgeKind, IrEdge, IrNode, NodeCategory, NodeMeta, Workflow } from "./ir";
import type { StudioNodeData } from "./toReactFlow";

export type { StudioNodeData } from "./toReactFlow";

export function workflowToFlow(
  workflow: Workflow,
  nodeTypes: Record<string, NodeMeta>,
): { nodes: Node<StudioNodeData, "studio">[]; edges: Edge[] } {
  const nodes: Node<StudioNodeData, "studio">[] = workflow.nodes.map((n) => {
    const meta = nodeTypes[n.type];
    return {
      id: n.id,
      type: "studio",
      position: { x: n.position.x, y: n.position.y },
      data: {
        label: n.label ?? meta?.title ?? n.type,
        nodeType: n.type,
        category: (meta?.category ?? "application") as NodeCategory,
        title: meta?.title ?? n.type,
      },
    };
  });

  const edges: Edge[] = workflow.edges.map((e, i) => edgeToFlow(e, i));
  return { nodes, edges };
}

export function edgeToFlow(e: IrEdge, i: number): Edge {
  const isEvent = e.kind === "event";
  return {
    id: `${e.source}->${e.target}-${i}`,
    source: e.source,
    target: e.target,
    label: e.condition ?? undefined,
    data: { kind: e.kind },
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
  const irNodes: IrNode[] = nodes.map((n) => {
    const prev = base.nodes.find((x) => x.id === n.id);
    return {
      id: n.id,
      type: n.data.nodeType,
      label: n.data.label,
      config: prev?.config ?? {},
      inputs: prev?.inputs ?? {},
      extra_tags: prev?.extra_tags ?? [],
      position: { x: n.position.x, y: n.position.y },
    };
  });

  const irEdges: IrEdge[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    kind: ((e.data as { kind?: EdgeKind } | undefined)?.kind ??
      (e.animated ? "event" : "control")) as EdgeKind,
    condition: typeof e.label === "string" ? e.label : null,
  }));

  return {
    ...base,
    nodes: irNodes,
    edges: irEdges,
  };
}

export function newNodeId(existing: Set<string>, prefix: string): string {
  if (!existing.has(prefix)) return prefix;
  let i = 2;
  while (existing.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}
