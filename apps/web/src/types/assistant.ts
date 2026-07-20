/**
 * Moni Chat ask/setup result shapes (UI contract over /assistant/*).
 * Interim until D6 codegen. Provenance: #15, #55, D16, D18.
 */
import type { IntentResult } from "./analysis";

export type MoniAskResult =
  | {
      kind: "compose";
      explanation: string;
      workflowName: string | null;
    }
  | {
      kind: "intent";
      explanation: string;
      workflowName: null;
      templateId: string;
      config: IntentResult["config"];
      confidence: number;
    }
  | {
      kind: "clarify";
      explanation: string;
      workflowName: null;
    };
