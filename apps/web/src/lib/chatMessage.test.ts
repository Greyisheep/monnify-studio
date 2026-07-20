import { describe, expect, it } from "vitest";

import { parseChatBlocks, stripCanvasSuffix } from "./chatMessage";

describe("parseChatBlocks", () => {
  it("splits numbered explanations into intro + list", () => {
    const text =
      "Here's your payroll flow: 1. Company wallet 2. Monthly trigger 3. Bulk payout";
    expect(parseChatBlocks(text)).toEqual([
      { kind: "paragraph", text: "Here's your payroll flow:" },
      {
        kind: "list",
        items: ["Company wallet", "Monthly trigger", "Bulk payout"],
      },
    ]);
  });

  it("keeps short replies as a paragraph", () => {
    expect(parseChatBlocks("I need a bit more detail.")).toEqual([
      { kind: "paragraph", text: "I need a bit more detail." },
    ]);
  });
});

describe("stripCanvasSuffix", () => {
  it("removes the compose success suffix", () => {
    expect(
      stripCanvasSuffix("Built your shop. Loaded on the canvas, edit freely."),
    ).toEqual({
      body: "Built your shop.",
      loaded: true,
    });
  });
});
