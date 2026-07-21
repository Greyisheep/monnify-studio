import type { BlockRunResult, ExecutionEvent } from "@/types";

export function eventFriendlySummary(event: ExecutionEvent): string {
  const friendly = event.friendly_text?.trim();
  if (friendly) return friendly;
  const message = event.message?.trim();
  if (message) return message;
  return event.type;
}

export function eventHasTechnicalDetail(event: ExecutionEvent): boolean {
  return Boolean(
    event.message?.trim() ||
      event.node_id ||
      event.node_type ||
      event.error ||
      event.inputs ||
      event.request ||
      event.response ||
      Object.keys(event.outputs ?? {}).length > 0,
  );
}

/** Latest stateful event for each Block, derived directly from the Run stream. */
export function blockRunResults(
  events: ExecutionEvent[],
): Record<string, BlockRunResult> {
  const results: Record<string, BlockRunResult> = {};

  for (const event of events) {
    if (!event.node_id) continue;

    const state =
      event.type === "node.started"
        ? "running"
        : event.type === "node.waiting"
          ? "waiting"
          : event.type === "node.completed"
            ? "done"
            : event.type === "node.failed"
              ? "failed"
              : null;

    if (!state) continue;
    const previous = results[event.node_id];
    if (!previous || previous.event.seq < event.seq) {
      results[event.node_id] = { state, event };
    }
  }

  return results;
}
