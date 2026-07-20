/**
 * Execution-trace overlay: streamed events with redacted req/resp (#28).
 * Floats over the canvas; does not shrink the diagram (#44). Provenance: #28, D14, D15.
 */
"use client";

import type { ExecutionEvent, ExecutionRun } from "@/types";

export interface TracePanelProps {
  run: ExecutionRun | null;
  events: ExecutionEvent[];
  selectedSeq: number | null;
  running: boolean;
  error: string | null;
  onSelect: (seq: number | null) => void;
  onClose: () => void;
}

function eventLabel(event: ExecutionEvent): string {
  if (event.node_id) return `${event.type} · ${event.node_id}`;
  return event.type;
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function TracePanel({
  run,
  events,
  selectedSeq,
  running,
  error,
  onSelect,
  onClose,
}: TracePanelProps) {
  const selected =
    selectedSeq != null
      ? (events.find((event) => event.seq === selectedSeq) ?? null)
      : null;

  return (
    <aside className="studio-trace" aria-label="Execution trace">
      <div className="studio-trace__head">
        <div>
          <h2>Execution trace</h2>
          <p>
            {run
              ? `${run.status} · ${run.adapter} · ${run.id.slice(0, 8)}`
              : running
                ? "Starting run…"
                : "Run the workflow to stream events"}
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {error && <p className="studio-trace__error">{error}</p>}

      <ul className="studio-trace__list">
        {events.length === 0 && !running && !error && (
          <li className="studio-trace__empty">
            No events yet. Click Run (mock) in the toolbar.
          </li>
        )}
        {running && events.length === 0 && (
          <li className="studio-trace__empty">Streaming events…</li>
        )}
        {events.map((event) => (
          <li key={`${event.run_id}-${event.seq}`}>
            <button
              type="button"
              className={`studio-trace__row${
                selectedSeq === event.seq ? " is-selected" : ""
              }${event.type.includes("failed") ? " is-failed" : ""}${
                event.type.includes("waiting") ? " is-waiting" : ""
              }`}
              onClick={() =>
                onSelect(selectedSeq === event.seq ? null : event.seq)
              }
            >
              <span className="studio-trace__seq">{event.seq}</span>
              <span className="studio-trace__meta">
                <strong>{eventLabel(event)}</strong>
                {event.message && <span>{event.message}</span>}
              </span>
              {event.duration_ms != null && (
                <span className="studio-trace__dur">{event.duration_ms}ms</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="studio-trace__detail">
          <h3>Event detail</h3>
          {selected.node_type && (
            <p className="muted">{selected.node_type}</p>
          )}
          {selected.error && (
            <p className="type-error">{selected.error}</p>
          )}
          {selected.request && (
            <>
              <h4>Request (redacted)</h4>
              <pre>{pretty(selected.request)}</pre>
            </>
          )}
          {selected.response && (
            <>
              <h4>Response (redacted)</h4>
              <pre>{pretty(selected.response)}</pre>
            </>
          )}
          {Object.keys(selected.outputs ?? {}).length > 0 && (
            <>
              <h4>Outputs</h4>
              <pre>{pretty(selected.outputs)}</pre>
            </>
          )}
          {!selected.request &&
            !selected.response &&
            Object.keys(selected.outputs ?? {}).length === 0 &&
            !selected.error && (
              <p className="muted">No payload on this event.</p>
            )}
        </div>
      )}
    </aside>
  );
}
