/**
 * Moni Chat ask/setup result shapes (UI contract over /assistant/*).
 * Interim until D6 codegen. Provenance: #15, #55, D16, D18.
 */
import type { IntentResult, RemediationStep } from "./analysis";

export type MoniAskResult =
  | {
      kind: "compose";
      explanation: string;
      workflowName: string | null;
      // The composed workflow's id, so a business flow can generate its
      // dashboard artifact right after composing (#70, Flow B).
      workflowId: string | null;
    }
  | {
      kind: "refine";
      explanation: string;
      workflowName: string | null;
      findingsCaught: string[];
      steps: RemediationStep[];
    }
  | {
      kind: "refusal";
      explanation: string;
      workflowName: null;
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
