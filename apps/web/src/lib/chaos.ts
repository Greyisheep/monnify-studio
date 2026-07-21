/**
 * Chaos / counterexample helpers until #11 ships the scenario engine.
 * Provenance: #29, Phase 2.4.
 */
import type { AnalysisReport, Finding } from "@/types";
import type { ExecutionEvent } from "@/types";
import type { ScenarioResult } from "@/types/chaos";

export function isChaosUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHAOS_UI === "true";
}

export interface CounterexampleSlice {
  failingEvent: ExecutionEvent;
  /** Events from run start through the failing step (inclusive). */
  prefix: ExecutionEvent[];
}

/** Derive a counterexample from a practice-run trace (no scenario metadata yet). */
export function counterexampleFromTrace(
  events: ExecutionEvent[],
): CounterexampleSlice | null {
  if (events.length === 0) return null;
  const failingIndex = events.findIndex(
    (event) => event.type === "node.failed" || event.type === "run.failed",
  );
  if (failingIndex < 0) return null;
  return {
    failingEvent: events[failingIndex]!,
    prefix: events.slice(0, failingIndex + 1),
  };
}

/** Match a failed node to an analyzer finding by node_ids or path membership. */
export function linkFindingToFailure(
  report: AnalysisReport | null,
  failingNodeId: string | null | undefined,
): Finding | null {
  if (!report || !failingNodeId) return null;
  return (
    report.findings.find(
      (finding) =>
        finding.node_ids.includes(failingNodeId) ||
        finding.path.includes(failingNodeId),
    ) ?? null
  );
}

export function findingIndex(
  report: AnalysisReport | null,
  finding: Finding | null,
): number | null {
  if (!report || !finding) return null;
  const index = report.findings.findIndex(
    (item) =>
      item.rule_id === finding.rule_id &&
      item.node_ids.join() === finding.node_ids.join(),
  );
  return index >= 0 ? index : null;
}

/** Placeholder scenario row when only a practice-run counterexample exists. */
export function practiceRunScenario(
  counterexample: CounterexampleSlice,
  relatedFinding: Finding | null,
): ScenarioResult {
  return {
    scenario_id: "practice-run",
    title: "Practice run failure",
    status: "fail",
    counterexample: counterexample.prefix,
    related_rule_id: relatedFinding?.rule_id ?? null,
    related_finding: relatedFinding,
    message: counterexample.failingEvent.error ?? counterexample.failingEvent.message,
  };
}
