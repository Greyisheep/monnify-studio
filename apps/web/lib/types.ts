// IR and analysis types, matching the FastAPI JSON (#4).
// These mirror the Pydantic models; keep them in sync until we generate them
// from the exported JSON Schema (tracked on #3).

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Position {
  x: number;
  y: number;
}

export interface IRNode {
  id: string;
  type: string;
  label: string | null;
  position: Position;
}

export interface IREdge {
  source: string;
  target: string;
  kind: string; // "control" | "event"
  condition: string | null;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: IRNode[];
  edges: IREdge[];
}

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

export interface Report {
  workflow_id: string;
  findings: Finding[];
}

export interface RemediationStep {
  rule_id: string;
  action: string;
  added_nodes: string[];
  removed_nodes: string[];
}

export interface RemediationResult {
  workflow: Workflow;
  steps: RemediationStep[];
  remaining: Finding[];
}
