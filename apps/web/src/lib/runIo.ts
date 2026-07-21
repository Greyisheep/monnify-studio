/**
 * Summarize execution inputs/outputs for Block I/O pills (#151).
 */
import type { ExecutionEvent } from "@/types";

function summarizeValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") {
    return value.length > 28 ? `${value.slice(0, 28)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : `[${value.length}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const [key, raw] = entries[0]!;
    const rest = entries.length > 1 ? ` +${entries.length - 1}` : "";
    return `${key}=${summarizeValue(raw)}${rest}`;
  }
  return String(value);
}

export function summarizeRecord(
  record: Record<string, unknown> | null | undefined,
): string {
  if (!record || Object.keys(record).length === 0) return "—";
  return Object.entries(record)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${summarizeValue(value)}`)
    .join(", ");
}

/** Latest execution state per node_id from a Run stream. */
export function latestRunIoByNode(
  events: ExecutionEvent[],
): Record<
  string,
  {
    inputsSummary: string;
    outputsSummary: string;
    status: "running" | "waiting" | "completed" | "failed";
    failed?: boolean;
  }
> {
  const map: Record<
    string,
    {
      inputsSummary: string;
      outputsSummary: string;
      status: "running" | "waiting" | "completed" | "failed";
      failed?: boolean;
    }
  > = {};
  for (const event of events) {
    if (!event.node_id) continue;
    if (
      event.type !== "node.started" &&
      event.type !== "node.waiting" &&
      event.type !== "node.completed" &&
      event.type !== "node.failed"
    ) {
      continue;
    }
    const status =
      event.type === "node.started"
        ? "running"
        : event.type === "node.waiting"
          ? "waiting"
          : event.type === "node.failed"
            ? "failed"
            : "completed";
    map[event.node_id] = {
      inputsSummary: summarizeRecord(event.inputs ?? undefined),
      outputsSummary: summarizeRecord(event.outputs ?? undefined),
      status,
      failed: status === "failed",
    };
  }
  return map;
}
