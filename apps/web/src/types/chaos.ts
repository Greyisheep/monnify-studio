/**
 * Planned chaos / scenario contracts (#11, Phase 2.4).
 * Interim hand port until backend ships scenario engine + chaos report API.
 * Provenance: #29, BUILD_PLAN Phase 2.3–2.4.
 */
import type { Finding } from "./analysis";
import type { ExecutionEvent } from "./execution";

export type ScenarioStatus = "pass" | "fail" | "skipped" | "error";

/** One injected failure scenario (duplicate webhook, bad signature, …). */
export interface ScenarioResult {
  scenario_id: string;
  title: string;
  status: ScenarioStatus;
  /** When status is fail/error, the minimal failing event sequence. */
  counterexample?: ExecutionEvent[];
  /** Analyzer finding this scenario is meant to expose (when known). */
  related_rule_id?: string | null;
  related_finding?: Finding | null;
  message?: string | null;
}

/** Aggregated pass/fail report from POST /workflows/{id}/chaos/run (planned). */
export interface ChaosReport {
  workflow_id: string;
  run_id: string;
  passed: number;
  failed: number;
  skipped: number;
  scenarios: ScenarioResult[];
  /** First failing scenario for the counterexample viewer. */
  primary_counterexample?: ScenarioResult | null;
}
