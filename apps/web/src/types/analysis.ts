/**
 * Analysis report + remediation result shapes.
 * Interim hand port until D6 JSON Schema codegen. Mirrors analysis/remediation APIs.
 * Provenance: #27, #6, D6.
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
