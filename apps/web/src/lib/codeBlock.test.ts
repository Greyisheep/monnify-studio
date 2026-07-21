import { describe, expect, it } from "vitest";

import {
  CODE_BLOCK_META,
  CODE_BLOCK_TYPE,
  codeBlockConfig,
  codeBlockOutputRows,
  isCodeBlock,
} from "./codeBlock";

describe("Code Block configuration", () => {
  it("normalizes code text for the inspector", () => {
    expect(codeBlockConfig({ code: "result = amount * 100" }).code).toBe(
      "result = amount * 100",
    );
    expect(codeBlockConfig({ code: 123 }).code).toBe("");
  });

  it("normalizes string output key/value pairs", () => {
    expect(
      codeBlockConfig({
        outputs: { amount: "10000", ignored: 123, nested: { value: "nope" } },
      }).outputs,
    ).toEqual({ amount: "10000" });
    expect(codeBlockOutputRows({ amount: "10000" })).toEqual([
      { key: "amount", value: "10000" },
      { key: "", value: "" },
    ]);
  });

  it("identifies only the custom code block type", () => {
    expect(isCodeBlock(CODE_BLOCK_TYPE)).toBe(true);
    expect(isCodeBlock("payments.initialize")).toBe(false);
  });

  it("provides Code Block fallback catalog metadata", () => {
    expect(CODE_BLOCK_META).toMatchObject({
      type: "custom.code",
      title: "Code Block",
    });
  });
});
