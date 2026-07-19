// Map the IR into React Flow nodes and edges, and derive per-node flags from the
// analysis so the canvas makes correctness visible (#4, #38, D9).

import type { Edge, Node } from "reactflow";
import { CATEGORY } from "./theme";
import type { Report, Severity, Workflow } from "./types";

export interface StudioNodeData {
  label: string;
  nodeType: string;
  category: string;
  flagged: Severity | null;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export function categoryOf(nodeType: string): string {
  return nodeType.split(".")[0];
}

function worst(a: Severity | null, b: Severity): Severity {
  if (a === null) return b;
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

export function toFlow(
  workflow: Workflow,
  report: Report | null,
): { nodes: Node<StudioNodeData>[]; edges: Edge[] } {
  const flagged = new Map<string, Severity>();
  for (const finding of report?.findings ?? []) {
    for (const id of finding.node_ids) {
      flagged.set(id, worst(flagged.get(id) ?? null, finding.severity));
    }
  }

  const nodes: Node<StudioNodeData>[] = workflow.nodes.map((n) => ({
    id: n.id,
    type: "studio",
    position: { x: n.position.x, y: n.position.y },
    data: {
      label: n.label ?? n.id,
      nodeType: n.type,
      category: categoryOf(n.type),
      flagged: flagged.get(n.id) ?? null,
    },
  }));

  const eventColor = CATEGORY.event.color;
  const edges: Edge[] = workflow.edges.map((e, i) => {
    const isEvent = e.kind === "event";
    return {
      id: `e-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: "default",
      animated: isEvent,
      style: {
        stroke: isEvent ? eventColor : "#3a3a4a",
        strokeWidth: 1.5,
        strokeDasharray: isEvent ? "6 4" : undefined,
      },
    };
  });

  return { nodes, edges };
}
