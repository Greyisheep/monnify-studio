/**
 * Dagre auto-layout for the Studio canvas.
 * Heroes keep authored IR positions; re-layout when structure changes (#37, D14).
 */
import dagre from "@dagrejs/dagre";
import { Position, type Edge, type Node } from "@xyflow/react";

import type { GraphDiff, StudioNodeData, Workflow } from "@/types";

/** Matches studio-node card footprint in globals.css. */
export const STUDIO_NODE_WIDTH = 200;
export const STUDIO_NODE_HEIGHT = 88;

export function graphDiffChangesStructure(diff: GraphDiff): boolean {
  return (
    diff.added_nodes.length > 0 ||
    diff.removed_nodes.length > 0 ||
    diff.added_edges.length > 0 ||
    diff.removed_edges.length > 0
  );
}

export function layoutFlowElements<NodeData extends Record<string, unknown>>(
  nodes: Node<NodeData>[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    nodesep: 48,
    ranksep: 72,
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: STUDIO_NODE_WIDTH,
      height: STUDIO_NODE_HEIGHT,
    });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const isHorizontal = direction === "LR";
  const layoutedNodes = nodes.map((node) => {
    const placed = graph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: placed.x - STUDIO_NODE_WIDTH / 2,
        y: placed.y - STUDIO_NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/** Copy layouted canvas positions back onto the IR so Save keeps them. */
export function applyLayoutToWorkflow(
  workflow: Workflow,
  nodes: Node<StudioNodeData>[],
): Workflow {
  const positions = new Map(nodes.map((node) => [node.id, node.position]));
  return {
    ...workflow,
    nodes: workflow.nodes.map((irNode) => {
      const position = positions.get(irNode.id);
      return position
        ? { ...irNode, position: { x: position.x, y: position.y } }
        : irNode;
    }),
  };
}
