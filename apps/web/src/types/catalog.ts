/**
 * Node catalog metadata returned with workflows /GET /catalog.
 * Interim hand port of providers catalog until D6 codegen. Provenance: #4, D13, D6.
 */
export type NodeCategory =
  | "monnify"
  | "event"
  | "control"
  | "safety"
  | "application";

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
