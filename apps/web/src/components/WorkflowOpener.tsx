/**
 * Open stored workflows or start from a template.
 * Provenance: #55, #52.
 */
"use client";

import type { WorkflowSummary } from "@/types";

export interface WorkflowOpenerProps {
  workflows: WorkflowSummary[];
  activeId: string | null;
  busy: boolean;
  onOpen: (workflowId: string) => void;
  onRefresh: () => void;
  onNewTemplate: () => void;
}

export function WorkflowOpener({
  workflows,
  activeId,
  busy,
  onOpen,
  onRefresh,
  onNewTemplate,
}: WorkflowOpenerProps) {
  return (
    <div className="studio-workflow-opener">
      <label className="studio-workflow-opener__label">
        <span>Open</span>
        <select
          value={activeId ?? ""}
          disabled={busy || workflows.length === 0}
          onChange={(event) => {
            const id = event.target.value;
            if (id) onOpen(id);
          }}
          aria-label="Open workflow"
        >
          {workflows.length === 0 && <option value="">No workflows</option>}
          {workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name} ({workflow.id}) · v{workflow.version}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="studio-btn studio-btn--ghost"
        disabled={busy}
        onClick={onRefresh}
        title="Refresh workflow list"
      >
        Refresh
      </button>
      <button
        type="button"
        className="studio-btn studio-btn--ghost"
        disabled={busy}
        onClick={onNewTemplate}
      >
        Templates
      </button>
    </div>
  );
}
