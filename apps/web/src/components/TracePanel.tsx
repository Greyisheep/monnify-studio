/**
 * Execution-trace overlay: streamed events with redacted req/resp (#28).
 * Floats over the canvas; does not shrink the diagram (#44).
 * Provenance: #28, #79, D14, D15.
 */
"use client";

import { useEffect, useState } from "react";

import { eventFriendlySummary, eventHasTechnicalDetail } from "@/lib/traceEvent";
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

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function adapterLabel(adapter: ExecutionRun["adapter"]): string {
  return adapter === "monnify" ? "Monnify sandbox" : "Practice";
}

function TraceEventDetail({ event }: { event: ExecutionEvent }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const hasTechnical = eventHasTechnicalDetail(event);

  useEffect(() => {
    setShowTechnical(false);
  }, [event.seq]);

  return (
    <div className="studio-trace__detail">
      <h3>{eventFriendlySummary(event)}</h3>
      {hasTechnical && (
        <button
          type="button"
          className="studio-trace__technical-toggle"
          aria-expanded={showTechnical}
          onClick={() => setShowTechnical((open) => !open)}
        >
          {showTechnical ? "Hide technical details" : "Show technical details"}
        </button>
      )}
      {showTechnical && hasTechnical && (
        <div className="studio-trace__technical">
          {event.message && (
            <>
              <h4>Message</h4>
              <pre>{event.message}</pre>
            </>
          )}
          {(event.node_id || event.node_type) && (
            <>
              <h4>Node</h4>
              <pre>
                {pretty({
                  node_id: event.node_id ?? undefined,
                  node_type: event.node_type ?? undefined,
                })}
              </pre>
            </>
          )}
          {event.error && (
            <>
              <h4>Error</h4>
              <pre className="studio-trace__error-text">{event.error}</pre>
            </>
          )}
          {event.request && (
            <>
              <h4>Request (redacted)</h4>
              <pre>{pretty(event.request)}</pre>
            </>
          )}
          {event.response && (
            <>
              <h4>Response (redacted)</h4>
              <pre>{pretty(event.response)}</pre>
            </>
          )}
          {Object.keys(event.outputs ?? {}).length > 0 && (
            <>
              <h4>Outputs</h4>
              <pre>{pretty(event.outputs)}</pre>
            </>
          )}
        </div>
      )}
      {!hasTechnical && <p className="muted">No extra detail on this event.</p>}
    </div>
  );
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
              ? `${run.status} · ${adapterLabel(run.adapter)} · ${run.id.slice(0, 8)}`
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
            No events yet. Click Practice run in the toolbar.
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
                <strong>{eventFriendlySummary(event)}</strong>
              </span>
              {event.duration_ms != null && (
                <span className="studio-trace__dur">{event.duration_ms}ms</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {selected && <TraceEventDetail event={selected} />}
    </aside>
  );
}
