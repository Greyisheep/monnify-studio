import { describe, expect, it } from "vitest";

import type { ExecutionEvent } from "@/types";

import { eventFriendlySummary, eventHasTechnicalDetail } from "./traceEvent";

function baseEvent(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    id: "e1",
    run_id: "r1",
    seq: 1,
    type: "node.waiting",
    ts: "2026-07-20T00:00:00Z",
    message: "suspended at wait/event node",
    friendly_text: "Waiting for the customer to pay...",
    outputs: {},
    ...overrides,
  };
}

describe("eventFriendlySummary", () => {
  it("prefers friendly_text over message and type", () => {
    expect(eventFriendlySummary(baseEvent())).toBe(
      "Waiting for the customer to pay...",
    );
  });

  it("falls back to message when friendly_text is empty", () => {
    expect(
      eventFriendlySummary(baseEvent({ friendly_text: "", message: "run started" })),
    ).toBe("run started");
  });

  it("falls back to type when both strings are blank", () => {
    expect(
      eventFriendlySummary(
        baseEvent({ friendly_text: "", message: "", type: "run.completed" }),
      ),
    ).toBe("run.completed");
  });
});

describe("eventHasTechnicalDetail", () => {
  it("is true when message or payloads exist", () => {
    expect(eventHasTechnicalDetail(baseEvent())).toBe(true);
    expect(
      eventHasTechnicalDetail(
        baseEvent({
          message: "",
          friendly_text: "Done",
          request: { method: "POST" },
        }),
      ),
    ).toBe(true);
  });

  it("is false for friendly-only events", () => {
    expect(
      eventHasTechnicalDetail(
        baseEvent({
          message: "",
          friendly_text: "All done. Everything worked.",
          node_id: null,
          node_type: null,
        }),
      ),
    ).toBe(false);
  });
});
