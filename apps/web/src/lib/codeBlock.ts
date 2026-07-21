import type { NodeMeta } from "@/types";

export const CODE_BLOCK_TYPE = "custom.code";

export const CODE_BLOCK_META: NodeMeta = {
  type: CODE_BLOCK_TYPE,
  category: "application",
  title: "Code Block",
  description: "Write your own code between Monnify Blocks.",
};

export function isCodeBlock(type: string): boolean {
  return type === CODE_BLOCK_TYPE;
}

export function codeBlockConfig(config: Record<string, unknown>): {
  code: string;
  outputs: Record<string, string>;
} {
  const outputs =
    config.outputs && typeof config.outputs === "object" && !Array.isArray(config.outputs)
      ? Object.fromEntries(
          Object.entries(config.outputs).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};

  return {
    code: typeof config.code === "string" ? config.code : "",
    outputs,
  };
}

export function codeBlockOutputRows(
  outputs: Record<string, string>,
): Array<{ key: string; value: string }> {
  return [...Object.entries(outputs).map(([key, value]) => ({ key, value })), { key: "", value: "" }];
}
