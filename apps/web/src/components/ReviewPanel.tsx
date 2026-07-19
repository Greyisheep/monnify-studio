/**
 * Architecture Review panel: findings list, explain, Apply Fix.
 * Floats as an overlay over the canvas (#44). Provenance: #27, #44.
 */
"use client";

import { useState } from "react";

import { findingKey, severityCount } from "@/lib/findings";
import type { AnalysisReport, Finding } from "@/types";

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
      <div className="studio-counts">
        <span data-sev="critical">{severityCount(report, "critical")} Critical</span>
        <span data-sev="high">{severityCount(report, "high")} High</span>
        <span data-sev="medium">{severityCount(report, "medium")} Medium</span>
      </div>
      <ul className="studio-findings">
        {(report?.findings ?? []).length === 0 && !loading && (
          <li className="studio-clean">No architectural findings. Ship it.</li>
        )}
        {(report?.findings ?? []).map((finding, findingIndex) => (
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
