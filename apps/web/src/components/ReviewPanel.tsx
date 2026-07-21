/**
 * Architecture Review panel: findings list, severity filter, Apply Fix.
 * Provenance: #27, #44, #76.
 */
"use client";

import { useMemo, useState } from "react";

import { findingKey, severityCount } from "@/lib/findings";
import type { AnalysisReport, Finding, Severity } from "@/types";

export interface ReviewPanelProps {
  workflowName: string;
  report: AnalysisReport | null;
  loading: boolean;
  busy: boolean;
  selectedFindingIndex: number | null;
  onSelectFinding: (index: number | null) => void;
  onApplyFix: (ruleId: string) => void;
  onWhy: (finding: Finding) => void;
  onClose?: () => void;
}

export interface FindingCardProps {
  finding: Finding;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onWhy: () => void;
  onApplyFix: () => void;
}

type SeverityFilter = Severity | null;

export function ReviewPanel({
  workflowName,
  report,
  loading,
  busy,
  selectedFindingIndex,
  onSelectFinding,
  onApplyFix,
  onWhy,
  onClose,
}: ReviewPanelProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>(null);

  const indexedFindings = useMemo(() => {
    const findings = report?.findings ?? [];
    return findings.map((finding, index) => ({ finding, index }));
  }, [report]);

  const visibleFindings = useMemo(() => {
    if (!severityFilter) return indexedFindings;
    return indexedFindings.filter(
      ({ finding }) => finding.severity === severityFilter,
    );
  }, [indexedFindings, severityFilter]);

  function toggleSeverity(severity: Severity) {
    setSeverityFilter((current) => (current === severity ? null : severity));
    onSelectFinding(null);
  }

  return (
    <aside className="studio-review">
      <div className="studio-review__head">
        <div>
          <h2>Architecture Review</h2>
          <p>{workflowName || "-"}</p>
        </div>
        {onClose && (
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <div className="studio-counts" aria-label="Finding severity filters">
        {(
          [
            ["critical", "Critical"],
            ["high", "High"],
            ["medium", "Medium"],
          ] as const
        ).map(([severity, label]) => (
          <button
            key={severity}
            type="button"
            className={`studio-count${
              severityFilter === severity ? " is-active" : ""
            }`}
            data-sev={severity}
            aria-pressed={severityFilter === severity}
            onClick={() => toggleSeverity(severity)}
            title={
              severityFilter === severity
                ? `Clear ${label} filter`
                : `Show only ${label} findings`
            }
          >
            {severityCount(report, severity)} {label}
          </button>
        ))}
      </div>
      <ul className="studio-findings">
        {visibleFindings.length === 0 && !loading && (
          <li className="studio-clean">
            {severityFilter
              ? `No ${severityFilter} findings.`
              : "No architectural findings. Ship it."}
          </li>
        )}
        {visibleFindings.map(({ finding, index: findingIndex }) => (
          <FindingCard
            key={findingKey(finding, findingIndex)}
            finding={finding}
            selected={selectedFindingIndex === findingIndex}
            busy={busy}
            onSelect={() =>
              onSelectFinding(
                selectedFindingIndex === findingIndex ? null : findingIndex,
              )
            }
            onWhy={() => onWhy(finding)}
            onApplyFix={() => onApplyFix(finding.rule_id)}
          />
        ))}
      </ul>
    </aside>
  );
}

function FindingCard({
  finding,
  selected,
  busy,
  onSelect,
  onWhy,
  onApplyFix,
}: FindingCardProps) {
  return (
    <li className={selected ? "is-selected-finding" : ""}>
      <button type="button" className="finding-hit" onClick={onSelect}>
        <div className="finding-top">
          <span className={`sev sev-${finding.severity}`}>{finding.severity}</span>
          <strong>
            [{finding.rule_id}] {finding.title}
          </strong>
        </div>
        <p>{finding.message}</p>
        {finding.path.length > 0 && (
          <code className="finding-path">{finding.path.join(" → ")}</code>
        )}
      </button>
      <p className="finding-fix">{finding.remediation}</p>
      <div className="finding-actions">
        <button type="button" disabled={busy} onClick={onWhy}>
          Why?
        </button>
        {finding.doc_url && (
          <a href={finding.doc_url} target="_blank" rel="noreferrer">
            Docs
          </a>
        )}
        <button
          type="button"
          className="primary-btn"
          disabled={busy}
          onClick={onApplyFix}
        >
          Apply Fix
        </button>
      </div>
    </li>
  );
}
