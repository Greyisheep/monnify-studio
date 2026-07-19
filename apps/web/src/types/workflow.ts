/**
 * Workflow / IR graph shapes.
 * Interim hand port of monnify_studio.ir models until D6 JSON Schema codegen.
 * Provenance: #4, D6.
 */

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
