/**
 * React Flow node data for the Studio canvas. Frontend-owned (not IR).
 * Provenance: #4, D14.
 */
import type { NodeCategory, PortMeta } from "./catalog";

export interface StudioNodeRunIo {
  inputsSummary: string;
  outputsSummary: string;
  failed?: boolean;
}

export interface StudioNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  category: NodeCategory;
  title: string;
  /** Latest Run I/O for this Block (#151). */
  runIo?: StudioNodeRunIo | null;
  /** Saved IR config for "Edit triggers" display (Hover Card, read-only this run). */
  config?: Record<string, unknown>;
  /** Catalog's declared input ports for this node type - drives which
   * "Edit triggers" field rows render, even before the node has any saved
   * config values (Hover Card, AC-2/E-1). */
  inputs?: PortMeta[];
}
