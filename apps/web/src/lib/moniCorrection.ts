import type { ComposeResult } from "@/types";
import type {
  MoniCorrectionEntry,
  MoniCorrectionPhase,
  MoniCorrectionSsePayload,
} from "@/types/moniCorrection";

let entryCounter = 0;

function nextId(phase: MoniCorrectionPhase): string {
  entryCounter += 1;
  return `${phase}-${entryCounter}`;
}

export function moniCorrectionFromSse(
  eventName: string,
  payload: MoniCorrectionSsePayload,
): MoniCorrectionEntry | null {
  const text = payload.text?.trim();
  switch (eventName) {
    case "status":
      return text
        ? { id: nextId("status"), phase: "status", text }
        : null;
    case "proposed": {
      const count = payload.step_count;
      const line =
        text ??
        (typeof count === "number"
          ? `Moni proposed ${count} step${count === 1 ? "" : "s"}`
          : "Moni proposed a flow");
      return { id: nextId("proposed"), phase: "proposed", text: line };
    }
    case "finding": {
      const rule = payload.rule_id?.trim();
      const detail = payload.message?.trim();
      const line =
        text ??
        (rule && detail
          ? `Checker caught ${rule}: ${detail}`
          : rule
            ? `Checker caught ${rule}`
            : detail
              ? `Checker caught an issue: ${detail}`
              : "Checker found a problem");
      return { id: nextId("finding"), phase: "finding", text: line };
    }
    case "correcting":
      return {
        id: nextId("correcting"),
        phase: "correcting",
        text: text ?? "Moni corrected it",
      };
    case "passed":
      return {
        id: nextId("passed"),
        phase: "passed",
        text: text ?? "All checks passed",
      };
    default:
      return null;
  }
}

/** Build a friendly post-hoc timeline from the compose/refine JSON result. */
export function moniCorrectionFromResult(result: ComposeResult): MoniCorrectionEntry[] {
  const entries: MoniCorrectionEntry[] = [];
  const stepCount = result.workflow.nodes.length;

  entries.push({
    id: nextId("proposed"),
    phase: "proposed",
    text: `Moni proposed ${stepCount} step${stepCount === 1 ? "" : "s"}`,
  });

  for (const ruleId of result.findings_caught) {
    const step = result.steps.find((item) => item.rule_id === ruleId);
    const detail = step?.action?.trim();
    entries.push({
      id: nextId("finding"),
      phase: "finding",
      text: detail
        ? `Checker caught ${ruleId}: ${detail}`
        : `Checker caught ${ruleId}`,
    });
  }

  if (result.steps.length > 0) {
    entries.push({
      id: nextId("correcting"),
      phase: "correcting",
      text: "Moni corrected it",
    });
  }

  if (result.analysis.findings.length === 0) {
    entries.push({
      id: nextId("passed"),
      phase: "passed",
      text: "All checks passed",
    });
  }

  return entries;
}
