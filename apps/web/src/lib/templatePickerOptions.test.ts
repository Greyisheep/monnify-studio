import { describe, expect, it } from "vitest";
import {
  TEMPLATE_PICKER_BACK_LABEL,
  TEMPLATE_PICKER_OPTIONS,
  TEMPLATE_PICKER_SELECT_BUSY_LABEL,
  TEMPLATE_PICKER_SELECT_LABEL,
  TEMPLATE_PICKER_SUBTITLE,
  TEMPLATE_PICKER_TITLE,
} from "./templatePickerOptions";

describe("template picker options match Figma contract", () => {
  it("uses Figma header copy", () => {
    expect(TEMPLATE_PICKER_TITLE).toBe("What do you want to do?");
    expect(TEMPLATE_PICKER_SUBTITLE).toBe(
      "Pick a vetted product template. Safety nodes come built in.",
    );
  });

  it("lists four options in Figma order with stable ids", () => {
    expect(TEMPLATE_PICKER_OPTIONS.map((o) => o.id)).toEqual([
      "sell-online",
      "ajo",
      "invoice",
      "__other__",
    ]);
    expect(TEMPLATE_PICKER_OPTIONS.map((o) => o.title)).toEqual([
      "Sell goods & services",
      "Start a savings group (Ajo)",
      "Send an invoice",
      "Something else",
    ]);
  });

  it("keeps unique Ajo description (OQ-1) and invoice/something-else copy", () => {
    const ajo = TEMPLATE_PICKER_OPTIONS.find((o) => o.id === "ajo");
    const invoice = TEMPLATE_PICKER_OPTIONS.find((o) => o.id === "invoice");
    const other = TEMPLATE_PICKER_OPTIONS.find((o) => o.id === "__other__");
    expect(ajo?.description).toBe(
      "Collect member contributions and track the rotating pool",
    );
    expect(invoice?.description).toBe("Create invoices to share to customers");
    expect(other?.kind).toBe("other");
    expect(other?.image).toBeNull();
  });

  it("uses Select / Opening… / Back labels", () => {
    expect(TEMPLATE_PICKER_SELECT_LABEL).toBe("Select");
    expect(TEMPLATE_PICKER_SELECT_BUSY_LABEL).toBe("Opening…");
    expect(TEMPLATE_PICKER_BACK_LABEL).toBe("Back");
  });

  it("avoids IR/SSE jargon in picker chrome", () => {
    const blob = [
      TEMPLATE_PICKER_TITLE,
      TEMPLATE_PICKER_SUBTITLE,
      ...TEMPLATE_PICKER_OPTIONS.flatMap((o) => [o.title, o.description]),
    ].join(" ");
    expect(blob.toLowerCase()).not.toMatch(/\b(ir|sse|json|webhook)\b/);
  });
});
