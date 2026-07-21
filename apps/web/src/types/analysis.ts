/**
 * Analysis report + remediation + Moni compose/intent shapes.
 * Interim hand port until D6 JSON Schema codegen.
 * Mirrors analysis/remediation APIs and monnify_studio.ai response models.
 * Provenance: #27, #6, #15, #55, D6, D16, D18.
 */
import type { NodeMeta } from "./catalog";
import type { Workflow } from "./workflow";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  rule_id: string;
  severity: Severity;
  title: string;
  message: string;
  node_ids: string[];
  path: string[];
  explanation: string;
  remediation: string;
  doc_url: string;
}

export interface AnalysisReport {
  workflow_id: string;
  findings: Finding[];
}

export interface RemediationStep {
  rule_id: string;
  action: string;
  added_nodes: string[];
  removed_nodes: string[];
}

export interface GraphDiff {
  added_nodes: string[];
  removed_nodes: string[];
  added_edges: string[];
  removed_edges: string[];
  steps?: RemediationStep[];
}

export interface WorkflowPayload {
  workflow: Workflow;
  node_types: Record<string, NodeMeta>;
}

export interface RemediateResult {
  workflow: Workflow;
  node_types: Record<string, NodeMeta>;
  analysis: AnalysisReport;
  diff: GraphDiff;
}

/** POST /assistant/explain (D20, #76). */
export interface ExplainSource {
  title: string;
  url: string;
}

export interface ExplainResult {
  answer: string;
  sources: ExplainSource[];
  provider: string;
}

/** POST /assistant/compose (monnify_studio.ai). Provenance: #15, #55, D16, D18. */
export interface ComposeResult {
  workflow: Workflow;
  node_types: Record<string, NodeMeta>;
  analysis: AnalysisReport;
  findings_caught: string[];
  steps: RemediationStep[];
  provider: string;
  explanation: string;
}

/** POST /assistant/intent (monnify_studio.ai). Provenance: #15, D16, D18. */
export interface IntentResult {
  template_id: string;
  confidence: number;
  config: Record<string, string | number>;
  explanation: string;
  clarifying_question: string;
  provider: string;
}
