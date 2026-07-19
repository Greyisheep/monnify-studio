/**
 * Architecture Review panel: findings list, severity filter, Apply Fix.
 * Provenance: #27, #44.
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
  onClose?: () => void;
}

export interface FindingCardProps {
  finding: Finding;
  selected: boolean;
  explained: boolean;
  busy: boolean;
  onSelect: () => void;
  onToggleExplain: () => void;
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
  onClose,
}: ReviewPanelProps) {
  const [expandedExplain, setExpandedExplain] = useState<number | null>(null);
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
    setExpandedExplain(null);
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
            <strong>{severityCount(report, severity)}</strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {severityFilter && (
        <p className="studio-counts__hint">
          Showing {severityFilter} only · click again to clear
        </p>
      )}
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
            explained={expandedExplain === findingIndex}
            busy={busy}
            onSelect={() =>
              onSelectFinding(
                selectedFindingIndex === findingIndex ? null : findingIndex,
              )
            }
            onToggleExplain={() =>
              setExpandedExplain((currentIndex) =>
                currentIndex === findingIndex ? null : findingIndex,
              )
            }
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
  explained,
  busy,
  onSelect,
  onToggleExplain,
  onApplyFix,
}: FindingCardProps) {
  return (
    <li
      className={`finding-card${selected ? " is-selected-finding" : ""}`}
      data-sev={finding.severity}
    >
      <button type="button" className="finding-hit" onClick={onSelect}>
        <div className="finding-top">
          <span className={`sev sev-${finding.severity}`}>{finding.severity}</span>
          <code className="finding-rule">{finding.rule_id}</code>
        </div>
        <strong className="finding-title">{finding.title}</strong>
        <p>{finding.message}</p>
        {finding.path.length > 0 && (
          <code className="finding-path">{finding.path.join(" → ")}</code>
        )}
      </button>
      <p className="finding-fix">{finding.remediation}</p>
      <div className="finding-actions">
        <button type="button" onClick={onToggleExplain}>
          Explain
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
      {explained && <p className="finding-explain">{finding.explanation}</p>}
    </li>
  );
}
