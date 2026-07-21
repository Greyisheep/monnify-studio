import { describe, expect, it } from "vitest";

import { latestRunIoByNode, summarizeRecord } from "@/lib/runIo";
import type { ExecutionEvent } from "@/types";

describe("runIo summaries (#151)", () => {
  it("summarizes records for pills", () => {
    expect(summarizeRecord({ amount: 45000, status: "PAID" })).toContain(
      "amount:",
    );
    expect(summarizeRecord({})).toBe("—");
  });

  it("keeps latest completed/failed event per node", () => {
    const events = [
      {
        id: "1",
        run_id: "r",
        seq: 1,
        type: "node.completed",
        ts: "",
        node_id: "n1",
        message: "",
        friendly_text: "",
        inputs: { amount: 100 },
        outputs: { status: "ok" },
      },
      {
        id: "2",
        run_id: "r",
        seq: 2,
        type: "node.failed",
        ts: "",
        node_id: "n1",
        message: "",
        friendly_text: "",
        inputs: { amount: 100 },
        outputs: {},
        error: "boom",
      },
    ] as ExecutionEvent[];

    const map = latestRunIoByNode(events);
    expect(map.n1?.failed).toBe(true);
    expect(map.n1?.inputsSummary).toContain("amount");
  });
});
