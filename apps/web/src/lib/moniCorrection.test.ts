import { describe, expect, it } from "vitest";

import {
  moniCorrectionFromResult,
  moniCorrectionFromSse,
} from "./moniCorrection";
import type { ComposeResult } from "@/types";

function stubNode(id: string): ComposeResult["workflow"]["nodes"][number] {
  return {
    id,
    type: "x",
    label: id,
    config: {},
    inputs: {},
    extra_tags: [],
    position: { x: 0, y: 0 },
  };
}

describe("moniCorrectionFromSse", () => {
  it("maps proposed events to friendly copy", () => {
    expect(
      moniCorrectionFromSse("proposed", { step_count: 12 })?.text,
    ).toBe("Moni proposed 12 steps");
  });

  it("maps finding events with rule and message", () => {
    expect(
      moniCorrectionFromSse("finding", {
        rule_id: "MON012",
        message: "balance not checked",
      })?.text,
    ).toBe("Checker caught MON012: balance not checked");
  });

  it("maps correcting and passed defaults", () => {
    expect(moniCorrectionFromSse("correcting", {})?.text).toBe("Moni corrected it");
    expect(moniCorrectionFromSse("passed", {})?.text).toBe("All checks passed");
  });
});

describe("moniCorrectionFromResult", () => {
  const base: ComposeResult = {
    workflow: {
      id: "wf-1",
      name: "Sell online",
      version: 1,
      provider: "monnify",
      description: "",
      variables: {},
      nodes: [stubNode("a")],
      edges: [],
    },
    node_types: {},
    analysis: { workflow_id: "wf-1", findings: [] },
    findings_caught: ["MON012"],
    steps: [{ rule_id: "MON012", action: "Added balance guard", added_nodes: [], removed_nodes: [] }],
    provider: "fake",
    explanation: "Built it.",
  };

  it("synthesizes the self-correction story from the JSON payload", () => {
    const lines = moniCorrectionFromResult({
      ...base,
      workflow: {
        ...base.workflow,
        nodes: Array.from({ length: 12 }, (_, index) => stubNode(`n${index}`)),
      },
    }).map((entry) => entry.text);

    expect(lines).toEqual([
      "Moni proposed 12 steps",
      "Checker caught MON012: Added balance guard",
      "Moni corrected it",
      "All checks passed",
    ]);
  });
});
