/**
 * Behaviour contracts for canvas auto-layout (#37, D14).
 * Pure functions only: no React / Next runtime.
 */
import { Position, type Edge, type Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { GraphDiff, StudioNodeData, Workflow } from "@/types";
import {
  applyLayoutToWorkflow,
  graphDiffChangesStructure,
  layoutFlowElements,
} from "./layout";

function emptyDiff(overrides: Partial<GraphDiff> = {}): GraphDiff {
  return {
    added_nodes: [],
    removed_nodes: [],
    added_edges: [],
    removed_edges: [],
    ...overrides,
  };
}

function studioNode(
  id: string,
  position: { x: number; y: number },
): Node<StudioNodeData> {
  return {
    id,
    type: "studio",
    position,
    data: {
      label: id,
      nodeType: "app.notify",
      category: "application",
      title: id,
    },
  };
}

function sampleWorkflow(positions: Record<string, { x: number; y: number }>): Workflow {
  return {
    id: "test",
    name: "test",
    version: 1,
    provider: "monnify",
    description: "",
    variables: {},
    entrypoint: "a",
    nodes: Object.entries(positions).map(([id, position]) => ({
      id,
      type: "app.notify",
      label: id,
      config: {},
      inputs: {},
      extra_tags: [],
      position,
    })),
    edges: [{ source: "a", target: "b", kind: "control", condition: null }],
  };
}

describe("graphDiffChangesStructure", () => {
  it("is false when only metadata steps changed", () => {
    expect(graphDiffChangesStructure(emptyDiff())).toBe(false);
  });

  it("is true when nodes or edges were added or removed", () => {
    expect(
      graphDiffChangesStructure(emptyDiff({ added_nodes: ["guard"] })),
    ).toBe(true);
    expect(
      graphDiffChangesStructure(emptyDiff({ removed_edges: ["a->b"] })),
    ).toBe(true);
  });
});

describe("layoutFlowElements", () => {
  it("assigns LR positions and side handles without overlapping", () => {
    const nodes = [
      studioNode("a", { x: 0, y: 0 }),
      studioNode("b", { x: 0, y: 0 }),
    ];
    const edges: Edge[] = [
      { id: "e1", source: "a", target: "b" },
    ];

    const { nodes: laidOut } = layoutFlowElements(nodes, edges, "LR");
    const [left, right] = laidOut;

    expect(left.targetPosition).toBe(Position.Left);
    expect(left.sourcePosition).toBe(Position.Right);
    expect(right.position.x).toBeGreaterThan(left.position.x);
    // Stacked input positions must not remain identical after layout.
    expect(left.position).not.toEqual(right.position);
  });
});

describe("applyLayoutToWorkflow", () => {
  it("writes canvas positions back onto matching IR nodes", () => {
    const workflow = sampleWorkflow({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
    });
    const canvasNodes = [
      studioNode("a", { x: 120, y: 40 }),
      studioNode("b", { x: 360, y: 40 }),
    ];

    const next = applyLayoutToWorkflow(workflow, canvasNodes);
    expect(next.nodes.find((node) => node.id === "a")?.position).toEqual({
      x: 120,
      y: 40,
    });
    expect(next.nodes.find((node) => node.id === "b")?.position).toEqual({
      x: 360,
      y: 40,
    });
    // Unrelated fields stay intact (Save persists layout, not a rewrite).
    expect(next.id).toBe(workflow.id);
    expect(next.edges).toEqual(workflow.edges);
  });
});
