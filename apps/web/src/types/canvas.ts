/**
 * React Flow node data for the Studio canvas. Frontend-owned (not IR).
 * Provenance: #4, D14.
 */
import type { NodeCategory } from "./catalog";

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
}
