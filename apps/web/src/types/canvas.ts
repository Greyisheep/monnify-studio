/**
 * React Flow node data for the Studio canvas. Frontend-owned (not IR).
 * Provenance: #4, D14.
 */
import type { NodeCategory } from "./catalog";

export interface StudioNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  category: NodeCategory;
  title: string;
}
