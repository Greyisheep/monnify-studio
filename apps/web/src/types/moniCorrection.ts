/**
 * Moni compose/refine self-correction timeline (#110, #106).
 * Mirrors the intended SSE contract; backend may emit these live or the UI
 * synthesizes them from the final ComposeResult until then.
 */
export type MoniCorrectionPhase =
  | "status"
  | "proposed"
  | "finding"
  | "correcting"
  | "passed";

export interface MoniCorrectionEntry {
  id: string;
  phase: MoniCorrectionPhase;
  text: string;
}

/** SSE payloads the backend should emit during compose/refine (#110). */
export interface MoniCorrectionSsePayload {
  text?: string;
  step_count?: number;
  rule_id?: string;
  message?: string;
  round?: number;
}
