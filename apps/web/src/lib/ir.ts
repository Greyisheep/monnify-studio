/** Mirror of the Python IR — keep aligned until JSON Schema export lands (#3). */

export type NodeCategory =
  | "monnify"
  | "event"
  | "control"
  | "safety"
  | "application";

export type EdgeKind = "control" | "event";

export interface Position {
  x: number;
  y: number;
}

export interface IrNode {
  id: string;
  type: string;
  label?: string | null;
  config: Record<string, unknown>;
  inputs: Record<string, string>;
  extra_tags: string[];
  position: Position;
}

export interface IrEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  condition?: string | null;
}

export interface Workflow {
  id: string;
  name: string;
  version: number;
  provider: string;
  description: string;
  variables: Record<string, unknown>;
  nodes: IrNode[];
  edges: IrEdge[];
  entrypoint?: string | null;
}

export interface PortMeta {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface NodeMeta {
  type: string;
  category: NodeCategory;
  title: string;
  description?: string;
  inputs?: PortMeta[];
  outputs?: PortMeta[];
}

export interface WorkflowPayload {
  workflow: Workflow;
  node_types: Record<string, NodeMeta>;
}

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

export interface GraphDiff {
  added_nodes: string[];
  removed_nodes: string[];
  added_edges: string[];
  removed_edges: string[];
  steps?: { rule_id: string; action: string; added_nodes: string[]; removed_nodes: string[] }[];
}

export interface RemediateResult {
  workflow: Workflow;
  node_types: Record<string, NodeMeta>;
  analysis: AnalysisReport;
  diff: GraphDiff;
}
