/**
 * Counterexample / failure-trace viewer (#29).
 * Uses chaos report when backend ships (#11); until then derives counterexamples
 * from practice-run execution traces and links them to analyzer findings.
 * Provenance: #29, Phase 2.4, BUILD_PLAN.
 */
"use client";

import { useMemo } from "react";

import {
  counterexampleFromTrace,
  findingIndex,
  linkFindingToFailure,
  practiceRunScenario,
} from "@/lib/chaos";
import { eventFriendlySummary } from "@/lib/traceEvent";
import type { AnalysisReport, ExecutionEvent, ExecutionRun } from "@/types";
import type { ChaosReport, ScenarioResult } from "@/types/chaos";

export interface FailureTracePanelProps {
  workflowName: string;
  report: AnalysisReport | null;
  chaosReport: ChaosReport | null;
  chaosError: string | null;
  chaosLoading: boolean;
  run: ExecutionRun | null;
  events: ExecutionEvent[];
  selectedSeq: number | null;
  running: boolean;
  traceError: string | null;
  onSelectSeq: (seq: number | null) => void;
  onSelectFinding: (index: number | null) => void;
  onApplyFix: (ruleId: string) => void;
  onRunChaosSuite: () => void;
  onClose: () => void;
  busy: boolean;
}

function ScenarioCounts({
  passed,
  failed,
  skipped,
}: {
  passed: number;
  failed: number;
  skipped: number;
}) {
  return (
    <div className="studio-chaos__counts" aria-label="Scenario results">
      <span className="studio-chaos__count studio-chaos__count--pass">
        {passed} pass
      </span>
      <span className="studio-chaos__count studio-chaos__count--fail">
        {failed} fail
      </span>
      <span className="studio-chaos__count studio-chaos__count--skip">
        {skipped} skip
      </span>
    </div>
  );
}

function RelatedFinding({
  finding,
  busy,
  onApplyFix,
  onSelect,
}: {
  finding: NonNullable<ScenarioResult["related_finding"]>;
  busy: boolean;
  onApplyFix: () => void;
  onSelect: () => void;
}) {
  return (
    <section className="studio-chaos__finding" aria-label="Related analyzer finding">
      <h3>Related finding</h3>
      <button type="button" className="finding-hit" onClick={onSelect}>
        <div className="finding-top">
          <span className={`sev sev-${finding.severity}`}>{finding.severity}</span>
          <strong>
            [{finding.rule_id}] {finding.title}
          </strong>
        </div>
        <p>{finding.message}</p>
      </button>
      <p className="finding-fix">{finding.remediation}</p>
      <button
        type="button"
        className="primary-btn"
        disabled={busy}
        onClick={onApplyFix}
      >
        Apply Fix
      </button>
    </section>
  );
}

export function FailureTracePanel({
  workflowName,
  report,
  chaosReport,
  chaosError,
  chaosLoading,
  run,
  events,
  selectedSeq,
  running,
  traceError,
  onSelectSeq,
  onSelectFinding,
  onApplyFix,
  onRunChaosSuite,
  onClose,
  busy,
}: FailureTracePanelProps) {
  const practiceCounterexample = useMemo(
    () => counterexampleFromTrace(events),
    [events],
  );

  const practiceFinding = useMemo(
    () => linkFindingToFailure(report, practiceCounterexample?.failingEvent.node_id),
    [report, practiceCounterexample],
  );

  const activeScenario: ScenarioResult | null = useMemo(() => {
    if (chaosReport?.primary_counterexample) return chaosReport.primary_counterexample;
    if (practiceCounterexample) {
      return practiceRunScenario(practiceCounterexample, practiceFinding);
    }
    return null;
  }, [chaosReport, practiceCounterexample, practiceFinding]);

  const counterexampleEvents = activeScenario?.counterexample ?? [];
  const passed = chaosReport?.passed ?? 0;
  const failed = chaosReport?.failed ?? (activeScenario ? 1 : 0);
  const skipped = chaosReport?.skipped ?? 0;

  return (
    <aside className="studio-chaos" aria-label="Failure trace and counterexample">
      <div className="studio-chaos__head">
        <div>
          <h2>Break test</h2>
          <p>{workflowName || "Untitled workflow"}</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {!chaosReport && (
        <p className="studio-chaos__stub">
          Scenario suite API pending (#11). Run a practice flow that fails, or use
          Test architecture once the backend ships{" "}
          <code>POST /workflows/&#123;id&#125;/chaos/run</code>.
        </p>
      )}

      <div className="studio-chaos__actions">
        <button
          type="button"
          className="primary-btn"
          disabled={busy || chaosLoading || running}
          onClick={onRunChaosSuite}
        >
          {chaosLoading ? "Testing…" : "Test architecture"}
        </button>
      </div>

      {chaosError && <p className="studio-chaos__error">{chaosError}</p>}
      {traceError && <p className="studio-chaos__error">{traceError}</p>}

      <ScenarioCounts passed={passed} failed={failed} skipped={skipped} />

      {!activeScenario && !running && !chaosLoading && (
        <p className="studio-chaos__empty">
          No counterexample yet. Inject a failure via the scenario engine (#11) or
          run a workflow step that fails in practice mode.
        </p>
      )}

      {activeScenario && (
        <>
          <section className="studio-chaos__scenario">
            <h3>{activeScenario.title}</h3>
            {activeScenario.message && (
              <p className="studio-chaos__scenario-msg">{activeScenario.message}</p>
            )}
          </section>

          <section className="studio-chaos__trace" aria-label="Failing step trace">
            <h3>Failing step trace</h3>
            <ul className="studio-trace__list">
              {counterexampleEvents.map((event) => (
                <li key={`${event.run_id}-${event.seq}`}>
                  <button
                    type="button"
                    className={`studio-trace__row${
                      selectedSeq === event.seq ? " is-selected" : ""
                    }${event.type.includes("failed") ? " is-failed" : ""}`}
                    onClick={() =>
                      onSelectSeq(selectedSeq === event.seq ? null : event.seq)
                    }
                  >
                    <span className="studio-trace__seq">{event.seq}</span>
                    <span className="studio-trace__meta">
                      <strong>{eventFriendlySummary(event)}</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {activeScenario.related_finding && (
            <RelatedFinding
              finding={activeScenario.related_finding}
              busy={busy}
              onApplyFix={() => onApplyFix(activeScenario.related_finding!.rule_id)}
              onSelect={() => {
                const index = findingIndex(report, activeScenario.related_finding);
                onSelectFinding(index);
              }}
            />
          )}
        </>
      )}

      {run && (
        <p className="studio-chaos__run-meta muted">
          Last run: {run.status} · {run.adapter} · {run.id.slice(0, 8)}
        </p>
      )}
    </aside>
  );
}
