import type { ExecutionEvent } from "@/types";

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
      event.request ||
      event.response ||
      Object.keys(event.outputs ?? {}).length > 0,
  );
}
