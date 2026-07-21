import { describe, expect, it } from "vitest";

import type { ExecutionEvent } from "@/types";

import {
  blockRunResults,
  eventFriendlySummary,
  eventHasTechnicalDetail,
} from "./traceEvent";

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
    expect(
      eventHasTechnicalDetail(
        baseEvent({
          message: "",
          friendly_text: "Done",
          inputs: { amount: 45000 },
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

describe("blockRunResults", () => {
  it("keeps the latest stateful event per Block", () => {
    const results = blockRunResults([
      baseEvent({ seq: 1, type: "node.started", node_id: "collect" }),
      baseEvent({
        seq: 2,
        type: "node.completed",
        node_id: "collect",
        inputs: { amount: 45000 },
        outputs: { status: "PAID" },
        duration_ms: 120,
      }),
      baseEvent({ seq: 3, type: "node.waiting", node_id: "notify" }),
      baseEvent({ seq: 4, type: "log", node_id: "collect" }),
    ]);

    expect(results.collect).toMatchObject({
      state: "done",
      event: { seq: 2, inputs: { amount: 45000 } },
    });
    expect(results.notify).toMatchObject({
      state: "waiting",
      event: { seq: 3 },
    });
  });
});
