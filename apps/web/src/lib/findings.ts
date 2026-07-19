/**
 * Finding helpers: severity counts, keys, path highlights, graph-diff copy.
 * Provenance: #27.
 */
import type { Edge, Node } from "@xyflow/react";

import type { AnalysisReport, Finding, GraphDiff, StudioNodeData } from "@/types";

export function severityCount(
  report: AnalysisReport | null,
  severity: Finding["severity"],
): number {
  return report?.findings.filter((finding) => finding.severity === severity).length ?? 0;
}

export function findingKey(finding: Finding, index: number): string {
  return `${finding.rule_id}-${finding.node_ids.join("-")}-${index}`;
}

export function formatGraphDiff(diff: GraphDiff): string {
  const parts = [
    diff.added_nodes.length && `+${diff.added_nodes.length} nodes`,
    diff.removed_nodes.length && `-${diff.removed_nodes.length} nodes`,
    diff.added_edges.length && `+${diff.added_edges.length} edges`,
    diff.removed_edges.length && `-${diff.removed_edges.length} edges`,
  ].filter(Boolean);
  return parts.join(" · ") || "No structural change";
}

export function findingHighlightIds(finding: Finding | null): Set<string> {
  const highlightIds = new Set<string>();
  if (!finding) return highlightIds;
  for (const nodeId of finding.node_ids) highlightIds.add(nodeId);
  for (const pathNodeId of finding.path) highlightIds.add(pathNodeId);
  return highlightIds;
}

export function withNodeHighlights(
  nodes: Node<StudioNodeData>[],
  highlightIds: Set<string>,
): Node<StudioNodeData>[] {
  return nodes.map((node) => ({
    ...node,
    className: highlightIds.has(node.id) ? "is-flagged" : undefined,
  }));
}

export function withEdgeHighlights(edges: Edge[], finding: Finding | null): Edge[] {
  return edges.map((edge) => {
    const onFindingPath =
      !!finding &&
      finding.path.length > 1 &&
      finding.path.includes(edge.source) &&
      finding.path.includes(edge.target);
    return {
      ...edge,
      style: {
        ...edge.style,
        strokeWidth: onFindingPath ? 3 : 1.5,
        stroke: onFindingPath
          ? "var(--danger)"
          : edge.animated
            ? "var(--edge-event)"
            : "var(--edge-control)",
      },
    };
  });
}
